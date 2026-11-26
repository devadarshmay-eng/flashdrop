import { describe, it, expect, vi, beforeAll } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

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

describe("FlashDrop Signaling Worker Routing", () => {
  const mockFetch = vi.fn(async (req: Request) => {
    return new Response(null, { status: 101 });
  });

  const mockStub = {
    fetch: mockFetch,
  };

  const mockNamespace = {
    idFromName: vi.fn((name: string) => `id-${name}`),
    get: vi.fn((id: string) => mockStub),
  };

  const env: Env = {
    TRANSFER_ROOM: mockNamespace as any,
  };

  it("GET /health returns 200 with service status", async () => {
    const req = new Request("https://signaling.local/health");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.service).toBe("flashdrop-signaling");
    expect(typeof data.timestamp).toBe("number");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("OPTIONS returns 204 with CORS preflight headers", async () => {
    const req = new Request("https://signaling.local/ws/room-123", {
      method: "OPTIONS",
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("GET /ws/:sessionId validates valid sessionId and forwards upgrade request to DO", async () => {
    const validSessionId = "session-1234_abcd";
    const req = new Request(`https://signaling.local/ws/${validSessionId}`, {
      headers: { Upgrade: "websocket" },
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(101);
    expect(mockNamespace.idFromName).toHaveBeenCalledWith(validSessionId);
    expect(mockNamespace.get).toHaveBeenCalledWith(`id-${validSessionId}`);
    expect(mockFetch).toHaveBeenCalledWith(req);
  });

  it("GET /ws/:sessionId rejects invalid session IDs with 400", async () => {
    // Too short (length < 4) or illegal characters
    const req = new Request("https://signaling.local/ws/ab", {
      headers: { Upgrade: "websocket" },
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Invalid session ID format");
  });

  it("GET /ws/:sessionId rejects non-WebSocket requests with 426 Upgrade Required", async () => {
    const req = new Request("https://signaling.local/ws/valid-room-id", {
      headers: { Upgrade: "http" },
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(426);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(false);
    expect(data.error).toContain("Expected WebSocket Upgrade");
  });

  it("returns 404 for unknown endpoints", async () => {
    const req = new Request("https://signaling.local/unknown/path");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
  });
});
