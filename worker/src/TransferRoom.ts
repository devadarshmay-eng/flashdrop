import { DurableObject } from "cloudflare:workers";
import type { Env, PeerRole, WebSocketAttachment, SignalingMessage } from "./types";

const MAX_PAYLOAD_SIZE = 32 * 1024; // 32KB payload guard
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MESSAGES_PER_SECOND = 200; // In-memory rate limit per socket

export class TransferRoom extends DurableObject<Env> {
  // In-memory sliding 1-second rate limiter per socket
  private socketRateLimits = new WeakMap<WebSocket, { count: number; windowStart: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private checkRateLimit(ws: WebSocket): boolean {
    const now = Date.now();
    let limiter = this.socketRateLimits.get(ws);
    if (!limiter || now - limiter.windowStart >= 1000) {
      limiter = { count: 1, windowStart: now };
      this.socketRateLimits.set(ws, limiter);
      return true;
    }

    if (limiter.count >= MAX_MESSAGES_PER_SECOND) {
      return false;
    }

    limiter.count += 1;
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const requestedRole = url.searchParams.get("role") as PeerRole | null;
    const peerId = url.searchParams.get("peerId") || "";

    let existingSockets = this.ctx.getWebSockets();

    // 1. If an incoming connection arrives with the same peerId (reconnection),
    // gracefully replace the older socket for that peer without triggering a disconnect cascade!
    if (peerId) {
      for (const s of existingSockets) {
        try {
          const att = s.deserializeAttachment() as WebSocketAttachment | null;
          if (att && att.peerId === peerId) {
            s.serializeAttachment({ role: null, joinedAt: 0 });
            s.close(1000, "Replaced by reconnecting peer");
          }
        } catch {}
      }
      existingSockets = this.ctx.getWebSockets().filter((s) => {
        try {
          const att = s.deserializeAttachment() as WebSocketAttachment | null;
          return att && att.role !== null;
        } catch {
          return false;
        }
      });
    }

    // 2. Strict 2-Peer Limit:
    // Reject any 3rd distinct socket attempt immediately with close code 4003 ('Room Full')
    if (existingSockets.length >= 2) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.close(4003, "Room Full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Determine role: use explicit requestedRole if valid, else infer from socket count
    let role: PeerRole;
    if (requestedRole === "host" || requestedRole === "guest") {
      role = requestedRole;
    } else {
      role = existingSockets.length === 0 ? "host" : "guest";
    }
    const isHost = role === "host";

    const attachment: WebSocketAttachment = {
      role,
      peerId,
      joinedAt: Date.now(),
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [role]);

    // On initialization, set 10-minute auto-destruct alarm
    if (isHost) {
      const currentAlarm = await this.ctx.storage.getAlarm();
      if (!currentAlarm) {
        await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS);
      }
    }

    // Acknowledge connection and role assignment to the joining peer
    try {
      server.send(JSON.stringify({ type: "ROOM_JOINED", role }));
    } catch (err) {
      console.error("Failed to send ROOM_JOINED message:", err);
    }

    // When both host and guest are connected, immediately send PEER_JOINED to the host
    const allSockets = this.ctx.getWebSockets();
    let hostWs: WebSocket | null = null;
    let guestWs: WebSocket | null = null;

    for (const ws of allSockets) {
      try {
        const att = ws.deserializeAttachment() as WebSocketAttachment | null;
        if (att?.role === "host") hostWs = ws;
        if (att?.role === "guest") guestWs = ws;
      } catch {}
    }

    if (hostWs && guestWs) {
      try {
        hostWs.send(JSON.stringify({ type: "PEER_JOINED" }));
      } catch (err) {
        console.error("Failed to notify host of PEER_JOINED:", err);
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // 32KB payload size guard
    const byteLength =
      typeof message === "string"
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;

    if (byteLength > MAX_PAYLOAD_SIZE) {
      try {
        ws.send(JSON.stringify({ type: "ERROR", error: "Payload exceeds 32KB limit" }));
      } catch {}
      return;
    }

    // In-memory rate limiting check (max 200 msgs/sec per socket)
    if (!this.checkRateLimit(ws)) {
      try {
        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded (max 200 msg/s)" }));
      } catch {}
      return;
    }

    // If raw binary ArrayBuffer is sent, relay directly in-memory to other peer
    if (typeof message !== "string") {
      const sockets = this.ctx.getWebSockets();
      for (const peer of sockets) {
        if (peer !== ws) {
          try {
            peer.send(message);
          } catch (err) {
            console.error("Failed to relay binary message to peer:", err);
          }
        }
      }
      return;
    }

    let parsed: SignalingMessage;
    try {
      parsed = JSON.parse(message);
    } catch {
      try {
        ws.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON message" }));
      } catch {}
      return;
    }

    // Handle keepalive ping (case-insensitive)
    const msgType = String(parsed.type || "").toLowerCase();
    if (msgType === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } catch {}
      return;
    }
    if (msgType === "pong") {
      return;
    }

    // Relay all messages (signaling, RELAY_DATA, RELAY_ACK, etc.) in-memory to other peer
    const sockets = this.ctx.getWebSockets();
    for (const peer of sockets) {
      if (peer !== ws) {
        try {
          peer.send(message);
        } catch (err) {
          console.error("Failed to relay message to peer:", err);
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    await this.handlePeerDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.handlePeerDisconnect(ws);
  }

  private async handlePeerDisconnect(closingWs: WebSocket): Promise<void> {
    let attachment: WebSocketAttachment | null = null;
    try {
      attachment = closingWs.deserializeAttachment() as WebSocketAttachment | null;
    } catch {
      // Attachment missing or deserialization failed
    }

    // If socket was not an accepted participant or role was cleared, ignore
    if (!attachment || !attachment.role) {
      return;
    }

    const isHost = attachment.role === "host";
    const remainingSockets = this.ctx.getWebSockets().filter((s) => s !== closingWs);

    if (isHost) {
      // Host left: session is truly dissolved. Notify any connected guest and wipe storage.
      for (const peer of remainingSockets) {
        try {
          peer.send(JSON.stringify({ type: "PEER_DISCONNECTED" }));
          peer.close(1000, "Host Left");
        } catch (err) {
          console.error("Failed to close remaining peer:", err);
        }
      }

      try {
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.deleteAlarm();
      } catch (err) {
        console.error("Failed to wipe storage on host disconnect:", err);
      }
    } else {
      // Guest left or disconnected:
      // DO NOT terminate host! DO NOT wipe storage!
      // Simply notify host that guest disconnected so host resets to waiting state.
      for (const peer of remainingSockets) {
        try {
          peer.send(JSON.stringify({ type: "PEER_DISCONNECTED" }));
        } catch (err) {
          console.error("Failed to notify host:", err);
        }
      }
    }
  }

  // Auto-Destruct Lifecycle: alarm() broadcasts SESSION_EXPIRED, closes all sockets with 4000, and wipes storage
  async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({ type: "SESSION_EXPIRED" }));
        ws.close(4000, "Session Expired");
      } catch (err) {
        console.error("Failed to close socket on session expiration alarm:", err);
      }
    }

    try {
      await this.ctx.storage.deleteAll();
    } catch (err) {
      console.error("Failed to wipe storage on session expiration alarm:", err);
    }
  }
}
