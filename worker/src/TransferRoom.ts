import { DurableObject } from "cloudflare:workers";
import type { Env, PeerRole, WebSocketAttachment, SignalingMessage } from "./types";

const MAX_PAYLOAD_SIZE = 32 * 1024; // 32KB payload guard
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class TransferRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }

    const existingSockets = this.ctx.getWebSockets();

    // Enforce strict 2-peer limit (host = 1st peer, guest = 2nd peer)
    // Reject any 3rd socket attempt immediately with close code 4003 ('Room Full')
    if (existingSockets.length >= 2) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.close(4003, "Room Full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const isHost = existingSockets.length === 0;
    const role: PeerRole = isHost ? "host" : "guest";

    const attachment: WebSocketAttachment = {
      role,
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

    // When 2nd peer (guest) joins, immediately broadcast { type: "PEER_JOINED" } to host
    if (!isHost) {
      for (const socket of existingSockets) {
        try {
          socket.send(JSON.stringify({ type: "PEER_JOINED" }));
        } catch (err) {
          console.error("Failed to notify host of PEER_JOINED:", err);
        }
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

    let parsed: SignalingMessage;
    try {
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      parsed = JSON.parse(text);
    } catch {
      try {
        ws.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON message" }));
      } catch {}
      return;
    }

    // Handle keepalive ping
    if (parsed.type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } catch {}
    }

    // Relay signaling messages (offer, answer, ice-candidate, ping, pong, etc.) only between peers
    const sockets = this.ctx.getWebSockets();
    const payloadToSend = typeof message === "string" ? message : JSON.stringify(parsed);

    for (const peer of sockets) {
      if (peer !== ws) {
        try {
          peer.send(payloadToSend);
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

    // If socket was not an accepted participant (e.g. was rejected 3rd peer), ignore
    if (!attachment || !attachment.role) {
      return;
    }

    // Broadcast { type: "PEER_DISCONNECTED" } to remaining peer, close remaining sockets, wipe state
    const remainingSockets = this.ctx.getWebSockets().filter((s) => s !== closingWs);
    for (const peer of remainingSockets) {
      try {
        peer.send(JSON.stringify({ type: "PEER_DISCONNECTED" }));
        peer.close(1000, "Peer Disconnected");
      } catch (err) {
        console.error("Failed to close remaining peer:", err);
      }
    }

    try {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
    } catch (err) {
      console.error("Failed to wipe storage on peer disconnect:", err);
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
