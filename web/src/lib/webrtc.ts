import { WebRTCConfig } from './types';

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 0,
};

export class PeerConnectionManager {
  public pc: RTCPeerConnection | null = null;
  public dataChannel: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private config: WebRTCConfig;
  private isOfferer = false;
  private onIceCandidateCallback?: (candidate: RTCIceCandidateInit) => void;

  constructor(
    config: WebRTCConfig = {},
    customRtcConfig?: RTCConfiguration,
    onIceCandidate?: (candidate: RTCIceCandidateInit) => void
  ) {
    this.config = config;
    this.onIceCandidateCallback = onIceCandidate;
    const rtcConfig = customRtcConfig || DEFAULT_RTC_CONFIG;

    this.initializePeerConnection(rtcConfig);
  }

  private initializePeerConnection(rtcConfig: RTCConfiguration): void {
    this.pc = new RTCPeerConnection(rtcConfig);

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        const state = this.pc.connectionState;
        if (this.config.onConnectionStateChange) {
          this.config.onConnectionStateChange(state);
        }
        if (state === 'failed') {
          this.handleIceRestart();
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc) {
        const state = this.pc.iceConnectionState;
        if (this.config.onIceConnectionStateChange) {
          this.config.onIceConnectionStateChange(state);
        }
        if (state === 'disconnected') {
          this.handleIceRestart();
        }
      }
    };

    this.pc.onsignalingstatechange = () => {
      if (this.pc && this.config.onSignalingStateChange) {
        this.config.onSignalingStateChange(this.pc.signalingState);
      }
    };

    // Listen for incoming data channel if we are receiver
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  public createDataChannel(label: string = 'flashdrop-data'): RTCDataChannel {
    if (!this.pc) {
      throw new Error('RTCPeerConnection is not initialized');
    }
    this.isOfferer = true;
    const dc = this.pc.createDataChannel(label, {
      ordered: true,
    });
    this.setupDataChannel(dc);
    return dc;
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      if (this.config.onDataChannelOpen) {
        this.config.onDataChannelOpen();
      }
    };

    this.dataChannel.onclose = () => {
      if (this.config.onDataChannelClose) {
        this.config.onDataChannelClose();
      }
    };

    this.dataChannel.onmessage = (event) => {
      if (this.config.onDataChannelMessage) {
        this.config.onDataChannelMessage(event.data);
      }
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('RTCPeerConnection is not initialized');
    }
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('RTCPeerConnection is not initialized');
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;
    await this.processPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      throw new Error('RTCPeerConnection is not initialized');
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescriptionSet = true;
    await this.processPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet || !this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate', err);
    }
  }

  private async processPendingCandidates(): Promise<void> {
    if (!this.pc || !this.remoteDescriptionSet) {
      return;
    }
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Failed to add queued ICE candidate', err);
        }
      }
    }
  }

  public async handleIceRestart(): Promise<void> {
    if (!this.pc || !this.isOfferer) {
      return;
    }
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      // Offerer can broadcast this offer via the app layer
    } catch (err) {
      console.error('Failed to trigger ICE restart', err);
    }
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.onmessage = null;
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.onicecandidate = null;
      this.pc.ondatachannel = null;
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
  }

  public isRemoteDescriptionSet(): boolean {
    return this.remoteDescriptionSet;
  }

  public getPendingCandidateCount(): number {
    return this.pendingCandidates.length;
  }
}
