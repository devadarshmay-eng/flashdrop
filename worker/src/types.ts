export type PeerRole = "host" | "guest";

export interface Env {
  TRANSFER_ROOM: DurableObjectNamespace;
}

export type SignalingMessageType =
  | "ROOM_JOINED"
  | "PEER_JOINED"
  | "PEER_DISCONNECTED"
  | "SESSION_EXPIRED"
  | "ERROR"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "candidate"
  | "ping"
  | "pong";

export interface SignalingMessage {
  type: string;
  role?: PeerRole;
  error?: string;
  sdp?: unknown;
  candidate?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface WebSocketAttachment {
  role: PeerRole;
  joinedAt: number;
}
