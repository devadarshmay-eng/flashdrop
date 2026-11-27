import { SignalingMessage, SessionRole } from './types';

export interface SignalingClientOptions {
  url: string;
  sessionId: string;
  role?: SessionRole;
  heartbeatIntervalMs?: number;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  onMessage?: (msg: SignalingMessage) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: Event | Error) => void;
  onRoleAssigned?: (role: SessionRole) => void;
}

export class SignalingClient {
  private peerId: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private role: SessionRole | null = null;
  private heartbeatIntervalMs: number;
  private reconnectIntervalMs: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private isIntentionallyClosed = false;
  private pingTimer: any = null;
  private messageQueue: SignalingMessage[] = [];
  private relayListeners: Array<(msg: SignalingMessage) => void> = [];

  private onMessageCb?: (msg: SignalingMessage) => void;
  private onOpenCb?: () => void;
  private onCloseCb?: (code: number, reason: string) => void;
  private onErrorCb?: (err: Event | Error) => void;
  private onRoleAssignedCb?: (role: SessionRole) => void;

  constructor(options: SignalingClientOptions) {
    this.url = options.url;
    this.sessionId = options.sessionId;
    this.role = options.role || null;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 2000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;

    this.onMessageCb = options.onMessage;
    this.onOpenCb = options.onOpen;
    this.onCloseCb = options.onClose;
    this.onErrorCb = options.onError;
    this.onRoleAssignedCb = options.onRoleAssigned;
  }

  public connect(): void {
    this.isIntentionallyClosed = false;
    this.cleanupSocket();

    const normalizedUrl = this.url.replace(/\/+$/, '');
    const roleParam = this.role ? `&role=${encodeURIComponent(this.role)}` : '';
    const wsUrl = `${normalizedUrl}/ws/${this.sessionId}?peerId=${encodeURIComponent(this.peerId)}${roleParam}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      if (this.onErrorCb) {
        this.onErrorCb(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushQueue();
      if (this.onOpenCb) {
        this.onOpenCb();
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data: SignalingMessage = typeof event.data === 'string' 
          ? JSON.parse(event.data) 
          : event.data;

        const msgType = String(data.type || '').toLowerCase();

        if (msgType === 'pong') {
          return;
        }

        if (msgType === 'ping') {
          this.send({ type: 'pong' });
          return;
        }

        if ((data.type === 'ROOM_JOINED' || data.role) && data.role) {
          this.role = data.role as SessionRole;
          if (this.onRoleAssignedCb) {
            this.onRoleAssignedCb(data.role as SessionRole);
          }
        }

        if (data.type === 'RELAY_DATA' || data.type === 'RELAY_ACK') {
          for (const listener of this.relayListeners) {
            try {
              listener(data);
            } catch (e) {
              console.error('Relay listener error:', e);
            }
          }
        }

        if (this.onMessageCb) {
          this.onMessageCb(data);
        }
      } catch (err) {
        console.error('Failed to parse signaling message', err);
      }
    };

    this.ws.onerror = (event) => {
      if (this.onErrorCb) {
        this.onErrorCb(event);
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      if (this.onCloseCb) {
        this.onCloseCb(event.code, event.reason);
      }

      // Codes 4000 (expired), 4003 (room full) are terminal - do not reconnect
      if (!this.isIntentionallyClosed && event.code !== 4000 && event.code !== 4003) {
        this.attemptReconnect();
      }
    };
  }

  public send(msg: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  public getRole(): SessionRole | null {
    return this.role;
  }

  public setRole(role: SessionRole): void {
    this.role = role;
  }

  public addRelayListener(listener: (msg: SignalingMessage) => void): () => void {
    this.relayListeners.push(listener);
    return () => {
      this.relayListeners = this.relayListeners.filter((l) => l !== listener);
    };
  }

  public close(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    this.cleanupSocket();
    this.messageQueue = [];
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private flushQueue(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        if (msg) {
          this.ws.send(JSON.stringify(msg));
        }
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.isIntentionallyClosed) {
        this.connect();
      }
    }, this.reconnectIntervalMs);
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
