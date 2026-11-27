export type SessionRole = 'host' | 'guest';

export interface SignalingMessage {
  type:
    | 'ROOM_JOINED'
    | 'PEER_JOINED'
    | 'OFFER'
    | 'ANSWER'
    | 'ICE_CANDIDATE'
    | 'PING'
    | 'PONG'
    | 'ping'
    | 'pong'
    | 'PEER_DISCONNECTED'
    | 'SESSION_EXPIRED'
    | 'ERROR'
    | 'RELAY_DATA'
    | 'RELAY_ACK';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  role?: SessionRole;
  payload?: any;
  message?: string;
  data?: string; // base64 encoded binary data or serialized JSON wire message
  ackSeq?: number;
  seq?: number;
}

export interface FileMetadata {
  type: 'FILE_META';
  id: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
}

export interface FileEndMessage {
  type: 'FILE_END';
  id: string;
}

export interface FileCancelMessage {
  type: 'FILE_CANCEL';
  id: string;
  reason?: string;
}

export type TransferWireMessage = FileMetadata | FileEndMessage | FileCancelMessage;

export type TransferStatus =
  | 'pending'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TransferProgress {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  transferredBytes: number;
  percentage: number;
  speedBps: number; // Bytes per second
  speedMBs: string; // Formatted speed (e.g. "12.4 MB/s")
  status: TransferStatus;
  direction: 'send' | 'receive';
  blob?: Blob;
  objectUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  onDataChannelOpen?: () => void;
  onDataChannelClose?: () => void;
  onDataChannelMessage?: (data: ArrayBuffer | string) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onSignalingStateChange?: (state: RTCSignalingState) => void;
}

/**
 * Universal TransferChannel abstraction that can encapsulate either
 * an RTCDataChannel (direct P2P) or a WebSocket relay channel.
 */
export interface TransferChannel {
  readonly channelType: 'webrtc' | 'relay';
  readonly isReady: boolean;
  send(data: string | ArrayBuffer): void;
  waitForDrain(): Promise<void>;
  onMessage?: (data: string | ArrayBuffer) => void;
  onClose?: () => void;
  close(): void;
}
