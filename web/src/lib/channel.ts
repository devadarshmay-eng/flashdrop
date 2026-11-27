import { TransferChannel, SignalingMessage } from './types';
import { SignalingClient } from './signaling';

/**
 * Wraps an RTCDataChannel into a TransferChannel with native SCTP backpressure.
 */
export class WebRTCDataChannelAdapter implements TransferChannel {
  public readonly channelType = 'webrtc' as const;
  public onMessage?: (data: string | ArrayBuffer) => void;
  public onClose?: () => void;

  private dc: RTCDataChannel;
  private bufferLowThreshold: number;
  private bufferHighThreshold: number;

  constructor(
    dc: RTCDataChannel,
    bufferLowThreshold = 65536, // 64KB
    bufferHighThreshold = 262144 // 256KB
  ) {
    this.dc = dc;
    this.bufferLowThreshold = bufferLowThreshold;
    this.bufferHighThreshold = bufferHighThreshold;

    this.dc.binaryType = 'arraybuffer';
    this.dc.bufferedAmountLowThreshold = this.bufferLowThreshold;

    this.dc.onmessage = (event) => {
      if (this.onMessage) {
        this.onMessage(event.data);
      }
    };

    this.dc.onclose = () => {
      if (this.onClose) {
        this.onClose();
      }
    };
  }

  public get isReady(): boolean {
    return this.dc.readyState === 'open';
  }

  public send(data: string | ArrayBuffer): void {
    this.dc.send(data as any);
  }

  public async waitForDrain(): Promise<void> {
    if (this.dc.bufferedAmount <= this.bufferHighThreshold) {
      return;
    }
    return new Promise<void>((resolve) => {
      const onLow = () => {
        this.dc.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      this.dc.addEventListener('bufferedamountlow', onLow);
    });
  }

  public close(): void {
    try {
      this.dc.close();
    } catch {}
  }
}

/**
 * Implements TransferChannel over the active WebSocket signaling connection
 * using in-memory sliding window credit flow control (8 unacked chunks = 128KB in-flight).
 */
export class WebSocketRelayChannelAdapter implements TransferChannel {
  public readonly channelType = 'relay' as const;
  public onMessage?: (data: string | ArrayBuffer) => void;
  public onClose?: () => void;

  private signaling: SignalingClient;
  private maxInFlight: number;
  private currentSeq = 0;
  private lastAckedSeq = 0;
  private ackWaiters: Array<{ targetSeq: number; resolve: () => void }> = [];

  constructor(signaling: SignalingClient, maxInFlight = 8) {
    this.signaling = signaling;
    this.maxInFlight = maxInFlight;

    // Attach listener to incoming signaling messages for RELAY_DATA and RELAY_ACK
    this.signaling.addRelayListener((msg: SignalingMessage) => {
      if (msg.type === 'RELAY_ACK' && typeof msg.ackSeq === 'number') {
        this.handleAck(msg.ackSeq);
      } else if (msg.type === 'RELAY_DATA') {
        this.handleIncomingRelay(msg);
      }
    });
  }

  public get isReady(): boolean {
    return true;
  }

  public send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      // Control messages (FILE_META, FILE_END, FILE_CANCEL)
      this.signaling.send({
        type: 'RELAY_DATA',
        data,
      });
      return;
    }

    // Binary chunk: encode to base64 or send with sequence number
    this.currentSeq++;
    const seq = this.currentSeq;
    const base64Data = arrayBufferToBase64(data);

    this.signaling.send({
      type: 'RELAY_DATA',
      seq,
      data: base64Data,
    });
  }

  public async waitForDrain(): Promise<void> {
    const inFlight = this.currentSeq - this.lastAckedSeq;
    if (inFlight < this.maxInFlight) {
      return;
    }

    // Wait until lastAckedSeq slides forward
    return new Promise<void>((resolve) => {
      this.ackWaiters.push({
        targetSeq: this.currentSeq - this.maxInFlight + 1,
        resolve,
      });
    });
  }

  private handleAck(ackSeq: number): void {
    if (ackSeq > this.lastAckedSeq) {
      this.lastAckedSeq = ackSeq;
    }

    // Check waiters
    const remaining: Array<{ targetSeq: number; resolve: () => void }> = [];
    for (const waiter of this.ackWaiters) {
      if (this.lastAckedSeq >= waiter.targetSeq) {
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    this.ackWaiters = remaining;
  }

  private handleIncomingRelay(msg: SignalingMessage): void {
    if (!msg.data) return;

    if (typeof msg.seq === 'number') {
      // Binary chunk
      const buffer = base64ToArrayBuffer(msg.data);

      // Return immediate ACK back to sender to slide the credit window
      this.signaling.send({
        type: 'RELAY_ACK',
        ackSeq: msg.seq,
      });

      if (this.onMessage) {
        this.onMessage(buffer);
      }
    } else {
      // Wire text message (JSON string)
      if (this.onMessage) {
        this.onMessage(msg.data);
      }
    }
  }

  public close(): void {
    // Release any pending drain promises
    for (const waiter of this.ackWaiters) {
      waiter.resolve();
    }
    this.ackWaiters = [];
    if (this.onClose) {
      this.onClose();
    }
  }
}

// Fast Base64 / ArrayBuffer helpers
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
