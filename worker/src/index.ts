import { TransferRoom } from "./TransferRoom";
import type { Env } from "./types";

export { TransferRoom };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// Valid session ID: 4 to 64 alphanumeric characters, hyphens, or underscores (supports UUIDs & random IDs)
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{4,64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // GET /health
    if (url.pathname === "/health" || url.pathname === "/health/") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "flashdrop-signaling",
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // GET /ws/:sessionId
    const wsMatch = url.pathname.match(/^\/ws\/([^/]+)$/);
    if (wsMatch) {
      const sessionId = wsMatch[1];

      // Validate session ID format
      if (!SESSION_ID_REGEX.test(sessionId)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Invalid session ID format. Must be 4-64 alphanumeric characters or hyphens.",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      // Check for WebSocket upgrade header
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Expected WebSocket Upgrade request. Header 'Upgrade: websocket' required.",
          }),
          {
            status: 426,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          }
        );
      }

      // Forward request to Durable Object (normalize session ID to lowercase)
      const normalizedSessionId = sessionId.toLowerCase();
      const id = env.TRANSFER_ROOM.idFromName(normalizedSessionId);
      const roomStub = env.TRANSFER_ROOM.get(id);
      return roomStub.fetch(request);
    }

    // 404 for unhandled routes
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Not Found",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      }
    );
  },
};
