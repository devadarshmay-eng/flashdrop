import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import { TransferRoom } from "../src/TransferRoom";
import type { Env, WebSocketAttachment } from "../src/types";

// Polyfill Response in Node test environment to accept status 101 with webSocket
beforeAll(() => {
  const OriginalResponse = globalThis.Response;
  (globalThis as any).Response = class MockResponse extends OriginalResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: any }) {
      if (init && init.status === 101) {
        super(null, { status: 200, statusText: "Switching Protocols", headers: init.headers });
        Object.defineProperty(this, "status", { value: 101, writable: false });
        if (init.webSocket) {
          (this as any).webSocket = init.webSocket;
        }
      } else {
        super(body, init);
      }
    }
  };
});

// Mock WebSocket implementation for unit tests
class MockWebSocket {
  sentMessages: string[] = [];
  closeCode: number | null = null;
  closeReason: string | null = null;
  closed = false;
  attachment: any = null;
  readyState = 1; // OPEN
  url = "wss://signaling.local/ws";
  protocol = "";
  binaryType = "blob";
  bufferedAmount = 0;
  extensions = "";

  send(data: string | ArrayBuffer) {
    if (this.closed) throw new Error("Cannot send on closed WebSocket");
    this.sentMessages.push(typeof data === "string" ? data : new TextDecoder().decode(data));
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.closeCode = code ?? 1000;
    this.closeReason = reason ?? "Normal Closure";
  }

  accept() {}

  serializeAttachment(attachment: any) {
    this.attachment = JSON.parse(JSON.stringify(attachment));
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

// Setup global WebSocketPair mock
(globalThis as any).WebSocketPair = class {
  0: MockWebSocket;
  1: MockWebSocket;
  constructor() {
    this[0] = new MockWebSocket(); // Client
    this[1] = new MockWebSocket(); // Server
  }
};

describe("TransferRoom Durable Object", () => {
  let mockState: any;
  let mockStorage: Map<string, any>;
  let mockAlarm: number | null;
  let acceptedSockets: MockWebSocket[];
  let socketTags: Map<MockWebSocket, string[]>;
  let room: TransferRoom;
  let env: Env;

  beforeEach(() => {
    mockStorage = new Map<string, any>();
    mockAlarm = null;
    acceptedSockets = [];
    socketTags = new Map<MockWebSocket, string[]>();

    mockState = {
      storage: {
        getAlarm: vi.fn(async () => mockAlarm),
        setAlarm: vi.fn(async (timestamp: number) => {
          mockAlarm = timestamp;
        }),
        deleteAlarm: vi.fn(async () => {
          mockAlarm = null;
        }),
        get: vi.fn(async (key: string) => mockStorage.get(key)),
        put: vi.fn(async (key: string, value: any) => mockStorage.set(key, value)),
        deleteAll: vi.fn(async () => {
          mockStorage.clear();
        }),
      },
      acceptWebSocket: vi.fn((ws: MockWebSocket, tags?: string[]) => {
        acceptedSockets.push(ws);
        if (tags) {
          socketTags.set(ws, tags);
        }
      }),
      getWebSockets: vi.fn((tag?: string) => {
        if (!tag) return [...acceptedSockets.filter((ws) => !ws.closed)];
        return acceptedSockets.filter(
          (ws) => !ws.closed && socketTags.get(ws)?.includes(tag)
        );
      }),
    };

    env = {
      TRANSFER_ROOM: {} as any,
    };

    room = new TransferRoom(mockState, env);
  });

  it("should reject non-WebSocket upgrade requests with 426", async () => {
    const req = new Request("https://signaling.local/ws/test-room", {
      headers: { Upgrade: "http" },
    });
    const res = await room.fetch(req);
    expect(res.status).toBe(426);
  });

  it("should accept 1st peer as host, set 10m alarm, and send ROOM_JOINED with role host", async () => {
    const req = new Request("https://signaling.local/ws/test-room", {
      headers: { Upgrade: "websocket" },
    });

    const res = await room.fetch(req);
    expect(res.status).toBe(101);

    expect(acceptedSockets.length).toBe(1);
    const hostWs = acceptedSockets[0];

    // Check attachment
    expect(hostWs.deserializeAttachment()).toEqual(
      expect.objectContaining({ role: "host" })
    );

    // Check welcome message
    expect(hostWs.sentMessages.length).toBe(1);
    const welcome = JSON.parse(hostWs.sentMessages[0]);
    expect(welcome).toEqual({ type: "ROOM_JOINED", role: "host" });

    // Check alarm scheduled for 10 minutes in the future
    expect(mockState.storage.setAlarm).toHaveBeenCalled();
    expect(mockAlarm).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it("should accept 2nd peer as guest and immediately broadcast PEER_JOINED to host", async () => {
    // 1st peer (host)
    const hostReq = new Request("https://signaling.local/ws/test-room", {
      headers: { Upgrade: "websocket" },
    });
    await room.fetch(hostReq);
    const hostWs = acceptedSockets[0];

    // 2nd peer (guest)
    const guestReq = new Request("https://signaling.local/ws/test-room", {
      headers: { Upgrade: "websocket" },
    });
    const guestRes = await room.fetch(guestReq);
    expect(guestRes.status).toBe(101);

    expect(acceptedSockets.length).toBe(2);
    const guestWs = acceptedSockets[1];

    // Guest receives ROOM_JOINED with role guest
    expect(guestWs.deserializeAttachment()).toEqual(
      expect.objectContaining({ role: "guest" })
    );
    const guestWelcome = JSON.parse(guestWs.sentMessages[0]);
    expect(guestWelcome).toEqual({ type: "ROOM_JOINED", role: "guest" });

    // Host receives PEER_JOINED notification immediately
    expect(hostWs.sentMessages.length).toBe(2);
    const peerJoinedMsg = JSON.parse(hostWs.sentMessages[1]);
    expect(peerJoinedMsg).toEqual({ type: "PEER_JOINED" });
  });

  it("should strictly reject a 3rd peer attempt with close code 4003 ('Room Full')", async () => {
    // Join peer 1
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    // Join peer 2
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    expect(acceptedSockets.length).toBe(2);

    // Attempt peer 3
    const thirdReq = new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } });
    const thirdRes = await room.fetch(thirdReq);
    expect(thirdRes.status).toBe(101);

    // The 3rd socket should have been accepted and immediately closed with 4003
    expect(acceptedSockets.length).toBe(3);
    const thirdWs = acceptedSockets[2];
    expect(thirdWs.closed).toBe(true);
    expect(thirdWs.closeCode).toBe(4003);
    expect(thirdWs.closeReason).toBe("Room Full");

    // Ensure rejecting 3rd socket does not wipe room state or disconnect existing peers
    await room.webSocketClose(thirdWs as unknown as WebSocket, 4003, "Room Full", true);
    expect(acceptedSockets[0].closed).toBe(false);
    expect(acceptedSockets[1].closed).toBe(false);
  });

  it("should relay signaling messages between host and guest", async () => {
    // Setup host and guest
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    const hostWs = acceptedSockets[0];
    const guestWs = acceptedSockets[1];

    // Host sends WebRTC Offer
    const offerMsg = JSON.stringify({ type: "offer", sdp: "v=0\r\no=- 123 2 IN IP4 127.0.0.1..." });
    await room.webSocketMessage(hostWs as unknown as WebSocket, offerMsg);

    // Guest should receive the offer
    expect(guestWs.sentMessages).toContain(offerMsg);

    // Guest sends WebRTC Answer
    const answerMsg = JSON.stringify({ type: "answer", sdp: "v=0\r\no=- 456 2 IN IP4 127.0.0.1..." });
    await room.webSocketMessage(guestWs as unknown as WebSocket, answerMsg);

    // Host should receive the answer
    expect(hostWs.sentMessages).toContain(answerMsg);

    // Host sends ICE candidate
    const candidateMsg = JSON.stringify({ type: "ice-candidate", candidate: { candidate: "candidate:1 1 UDP..." } });
    await room.webSocketMessage(hostWs as unknown as WebSocket, candidateMsg);

    // Guest should receive ICE candidate
    expect(guestWs.sentMessages).toContain(candidateMsg);
  });

  it("should enforce 32KB payload guard and reject oversized messages", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    const hostWs = acceptedSockets[0];

    // Create payload > 32KB
    const oversizedPayload = JSON.stringify({
      type: "offer",
      data: "A".repeat(33 * 1024),
    });

    await room.webSocketMessage(hostWs as unknown as WebSocket, oversizedPayload);

    // Host should receive ERROR response
    const lastMsg = JSON.parse(hostWs.sentMessages[hostWs.sentMessages.length - 1]);
    expect(lastMsg).toEqual({ type: "ERROR", error: "Payload exceeds 32KB limit" });
  });

  it("should respond with pong on keepalive ping message", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    const hostWs = acceptedSockets[0];

    const pingMsg = JSON.stringify({ type: "ping" });
    await room.webSocketMessage(hostWs as unknown as WebSocket, pingMsg);

    const lastMsg = JSON.parse(hostWs.sentMessages[hostWs.sentMessages.length - 1]);
    expect(lastMsg.type).toBe("pong");
    expect(typeof lastMsg.timestamp).toBe("number");
  });

  it("should trigger auto-destruct on alarm(): broadcast SESSION_EXPIRED, close sockets with 4000, wipe storage", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    const hostWs = acceptedSockets[0];
    const guestWs = acceptedSockets[1];

    // Trigger alarm
    await room.alarm();

    // Both sockets receive SESSION_EXPIRED
    const hostLast = JSON.parse(hostWs.sentMessages[hostWs.sentMessages.length - 1]);
    const guestLast = JSON.parse(guestWs.sentMessages[guestWs.sentMessages.length - 1]);
    expect(hostLast).toEqual({ type: "SESSION_EXPIRED" });
    expect(guestLast).toEqual({ type: "SESSION_EXPIRED" });

    // Sockets closed with code 4000
    expect(hostWs.closed).toBe(true);
    expect(hostWs.closeCode).toBe(4000);
    expect(guestWs.closed).toBe(true);
    expect(guestWs.closeCode).toBe(4000);

    // Storage wiped
    expect(mockState.storage.deleteAll).toHaveBeenCalled();
  });

  it("should handle peer disconnect: broadcast PEER_DISCONNECTED, close remaining sockets, wipe state when host leaves", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    const hostWs = acceptedSockets[0];
    const guestWs = acceptedSockets[1];

    // Host disconnects
    hostWs.closed = true;
    await room.webSocketClose(hostWs as unknown as WebSocket, 1000, "Normal Closure", true);

    // Guest receives PEER_DISCONNECTED
    const guestLast = JSON.parse(guestWs.sentMessages[guestWs.sentMessages.length - 1]);
    expect(guestLast).toEqual({ type: "PEER_DISCONNECTED" });

    // Guest socket closed
    expect(guestWs.closed).toBe(true);
    expect(guestWs.closeCode).toBe(1000);

    // Storage and alarm wiped
    expect(mockState.storage.deleteAll).toHaveBeenCalled();
    expect(mockState.storage.deleteAlarm).toHaveBeenCalled();
  });

  it("should handle guest disconnect: notify host with PEER_DISCONNECTED while keeping host socket open", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    const hostWs = acceptedSockets[0];
    const guestWs = acceptedSockets[1];

    // Guest disconnects
    guestWs.closed = true;
    await room.webSocketClose(guestWs as unknown as WebSocket, 1000, "Normal Closure", true);

    // Host receives PEER_DISCONNECTED
    const hostLast = JSON.parse(hostWs.sentMessages[hostWs.sentMessages.length - 1]);
    expect(hostLast).toEqual({ type: "PEER_DISCONNECTED" });

    // Host socket remains open for reconnection
    expect(hostWs.closed).toBe(false);
  });

  it("should handle peer error similarly to peer disconnect", async () => {
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));
    await room.fetch(new Request("https://signaling.local/ws/test-room", { headers: { Upgrade: "websocket" } }));

    const hostWs = acceptedSockets[0];
    const guestWs = acceptedSockets[1];

    // Host encounters error
    hostWs.closed = true;
    await room.webSocketError(hostWs as unknown as WebSocket, new Error("Socket broken"));

    // Guest receives PEER_DISCONNECTED
    const guestLast = JSON.parse(guestWs.sentMessages[guestWs.sentMessages.length - 1]);
    expect(guestLast).toEqual({ type: "PEER_DISCONNECTED" });

    expect(guestWs.closed).toBe(true);
    expect(mockState.storage.deleteAll).toHaveBeenCalled();
  });
});
