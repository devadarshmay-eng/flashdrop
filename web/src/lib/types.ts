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
    | 'PEER_DISCONNECTED'
    | 'SESSION_EXPIRED'
    | 'ERROR';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  role?: SessionRole;
  payload?: any;
  message?: string;
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
