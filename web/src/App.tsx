import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { WaitingView } from './components/WaitingView';
import { ConnectingView } from './components/ConnectingView';
import { ConnectedView } from './components/ConnectedView';
import { DissolvedView } from './components/DissolvedView';

import {
  SignalingClient,
  PeerConnectionManager,
  FileTransferSender,
  FileTransferReceiver,
  TransferProgress,
  SessionRole,
  SignalingMessage,
  mobileManager,
} from './lib';

export type AppViewState = 'waiting' | 'connecting' | 'connected' | 'dissolved';

// Generate formatted human-readable room code like RM-7F4A-92C1 from UUID or ID
function formatRoomCode(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.startsWith('RM') && clean.length >= 10) {
    const rest = clean.slice(2);
    return `RM-${rest.substring(0, 4)}-${rest.substring(4, 8)}`;
  }
  if (clean.length >= 8) {
    return `RM-${clean.substring(0, 4)}-${clean.substring(4, 8)}`;
  }
  return `RM-${id.substring(0, 8).toUpperCase()}`;
}

// Generate collision-resistant 8-hex character room ID
function generateSessionId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `rm-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//${window.location.hostname}:8787`;
  }
  return `${protocol}//${window.location.host}`;
}

export const App: React.FC = () => {
  const [viewState, setViewState] = useState<AppViewState>('waiting');
  const [sessionId, setSessionId] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600);
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [connectionType, setConnectionType] = useState<'DIRECT LAN' | 'P2P STUN' | 'TURN RELAY'>('P2P STUN');
  const [verificationKey, setVerificationKey] = useState<string>('KEY 9F2A');

  const signalingRef = useRef<SignalingClient | null>(null);
  const rtcRef = useRef<PeerConnectionManager | null>(null);
  const senderRef = useRef<FileTransferSender | null>(null);
  const receiverRef = useRef<FileTransferReceiver | null>(null);
  const timerRef = useRef<any>(null);
  const thumbnailsRef = useRef<Map<string, string>>(new Map());

  // Dynamic Browser Tab Title
  useEffect(() => {
    if (viewState === 'waiting') {
      document.title = 'FlashDrop — Ephemeral P2P Transfer';
    } else if (viewState === 'connecting') {
      document.title = 'Connecting — FlashDrop';
    } else if (viewState === 'dissolved') {
      document.title = 'Session Dissolved — FlashDrop';
    } else if (viewState === 'connected') {
      const active = transfers.filter((t) => t.status === 'transferring');
      if (active.length > 0) {
        const avgPercent = Math.round(
          active.reduce((acc, t) => acc + t.percentage, 0) / active.length
        );
        document.title = `(${avgPercent}%) Transferring — FlashDrop`;
      } else {
        document.title = '● Connected — FlashDrop';
      }
    }
  }, [viewState, transfers]);

  // Initialize session based on URL (/s/:sessionId) or root (/)
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/s\/([a-zA-Z0-9_-]+)/);

    let activeSessionId = '';

    if (match && match[1]) {
      activeSessionId = match[1].toLowerCase();
      setSessionId(activeSessionId);
      setViewState('connecting');
      initSession(activeSessionId, 'guest');
    } else {
      activeSessionId = generateSessionId();
      setSessionId(activeSessionId);
      setViewState('waiting');

      const isMobile =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640);

      // On mobile root (/), user sees Pair Device panel (Scan / Enter Code) first.
      // We only initialize the host WebSocket if on desktop or if user chooses to host!
      if (!isMobile) {
        initSession(activeSessionId, 'host');
      }
    }

    return () => {
      cleanupAll();
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (viewState === 'waiting' || viewState === 'connected') {
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            handleSessionDissolve();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [viewState]);

  // Update wake lock based on active transfers
  useEffect(() => {
    const hasActive = transfers.some(
      (t) => t.status === 'transferring' || t.status === 'pending'
    );
    mobileManager.setActiveTransfer(hasActive);
  }, [transfers]);

  // Real WebRTC Telemetry: getStats() and DTLS fingerprint verification key
  const updateWebRtcTelemetry = useCallback(async () => {
    const pc = rtcRef.current?.pc;
    if (!pc) return;

    // 1. Compute deterministic verification key from SDP fingerprints
    const localSdp = pc.localDescription?.sdp || '';
    const remoteSdp = pc.remoteDescription?.sdp || '';
    const getFp = (sdp: string) => {
      const m = sdp.match(/a=fingerprint:\S+\s+([0-9A-Fa-f:]+)/);
      return m ? m[1].replace(/[^0-9A-Fa-f]/g, '').toUpperCase() : '';
    };
    const fp1 = getFp(localSdp);
    const fp2 = getFp(remoteSdp);
    const combined = [fp1, fp2].sort().join('');
    if (combined) {
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
      }
      const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0');
      setVerificationKey(`KEY ${hex.slice(-4)}`);
    }

    // 2. Candidate stats
    try {
      const stats = await pc.getStats();
      let selectedPair: any = null;
      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        } else if (
          report.type === 'candidate-pair' &&
          (report.nominated || report.selected || report.state === 'succeeded')
        ) {
          selectedPair = report;
        }
      });

      if (selectedPair && selectedPair.localCandidateId) {
        const localCandidate = stats.get(selectedPair.localCandidateId);
        if (localCandidate) {
          const cType = localCandidate.candidateType;
          if (cType === 'host') {
            setConnectionType('DIRECT LAN');
          } else if (cType === 'relay') {
            setConnectionType('TURN RELAY');
          } else {
            setConnectionType('P2P STUN');
          }
        }
      }
    } catch (err) {
      console.warn('Failed to inspect getStats:', err);
    }
  }, []);

  const initSession = (id: string, role: SessionRole) => {
    cleanupAll();

    const wsUrl = getWsUrl();
    let isHost = role === 'host';

    // 1. Setup PeerConnectionManager
    const rtc = new PeerConnectionManager(
      {
        onDataChannelOpen: () => {
          setViewState('connected');
          updateWebRtcTelemetry();
          setTimeout(updateWebRtcTelemetry, 1200);
        },
        onDataChannelClose: () => {
          handleSessionDissolve();
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            setViewState('connected');
            updateWebRtcTelemetry();
            setTimeout(updateWebRtcTelemetry, 1200);
          } else if (state === 'failed') {
            handleSessionDissolve();
          }
        },
      },
      undefined,
      (candidate) => {
        signalingRef.current?.send({
          type: 'ICE_CANDIDATE',
          candidate,
        });
      }
    );
    rtcRef.current = rtc;

    // 2. Setup Signaling Client
    const signaling = new SignalingClient({
      url: wsUrl,
      sessionId: id,
      role,
      onRoleAssigned: (assignedRole) => {
        isHost = assignedRole === 'host';
      },
      onOpen: () => {},
      onMessage: async (msg: SignalingMessage) => {
        await handleSignalingMessage(msg, rtc, isHost);
      },
      onClose: (code) => {
        if (code === 4000 || code === 4003) {
          handleSessionDissolve();
        }
      },
    });

    signalingRef.current = signaling;
    signaling.connect();

    // If host, create data channel upfront
    if (isHost) {
      const dc = rtc.createDataChannel('flashdrop-data');
      setupTransferChannels(dc);
    } else {
      const originalSetup = (rtc as any).setupDataChannel.bind(rtc);
      (rtc as any).setupDataChannel = (dc: RTCDataChannel) => {
        originalSetup(dc);
        setupTransferChannels(dc);
      };
    }
  };

  const setupTransferChannels = (dc: RTCDataChannel) => {
    const sender = new FileTransferSender({
      dataChannel: dc,
      onProgress: (p) => updateTransferProgress(p),
      onComplete: (p) => updateTransferProgress(p),
      onError: (_id, err) => console.error('Send error:', err),
    });
    senderRef.current = sender;

    const receiver = new FileTransferReceiver({
      dataChannel: dc,
      autoDownload: false,
      onProgress: (p) => updateTransferProgress(p),
      onComplete: (p) => updateTransferProgress(p),
      onError: (_id, err) => console.error('Receive error:', err),
    });
    receiverRef.current = receiver;
  };

  const handleSignalingMessage = async (
    msg: SignalingMessage,
    rtc: PeerConnectionManager,
    isHost: boolean
  ) => {
    switch (msg.type) {
      case 'PEER_JOINED':
        if (isHost) {
          setViewState('connecting');
          const offer = await rtc.createOffer();
          signalingRef.current?.send({
            type: 'OFFER',
            sdp: offer,
          });
        }
        break;

      case 'OFFER':
        if (!isHost && msg.sdp) {
          setViewState('connecting');
          const answer = await rtc.handleOffer(msg.sdp);
          signalingRef.current?.send({
            type: 'ANSWER',
            sdp: answer,
          });
        }
        break;

      case 'ANSWER':
        if (isHost && msg.sdp) {
          await rtc.handleAnswer(msg.sdp);
          updateWebRtcTelemetry();
        }
        break;

      case 'ICE_CANDIDATE':
        if (msg.candidate) {
          await rtc.addIceCandidate(msg.candidate);
        }
        break;

      case 'PEER_DISCONNECTED':
      case 'SESSION_EXPIRED':
        handleSessionDissolve();
        break;

      default:
        break;
    }
  };

  const updateTransferProgress = useCallback((progress: TransferProgress) => {
    setTransfers((prev) => {
      const thumb = thumbnailsRef.current.get(progress.name);
      const enriched = thumb && !progress.thumbnailUrl ? { ...progress, thumbnailUrl: thumb } : progress;

      const idx = prev.findIndex((t) => t.id === progress.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = enriched;
        return next;
      }
      return [enriched, ...prev];
    });
  }, []);

  const handleSendFiles = async (files: FileList | File[]) => {
    if (!senderRef.current) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Generate object URL for image thumbnail preview if image/*
      if (file.type && file.type.startsWith('image/')) {
        try {
          const thumbUrl = URL.createObjectURL(file);
          thumbnailsRef.current.set(file.name, thumbUrl);
        } catch {
          // Ignore thumbnail failure
        }
      }
      try {
        await senderRef.current.sendFile(file);
      } catch (err) {
        console.error('Failed to send file:', err);
      }
    }
  };

  const handleCancelTransfer = useCallback((id: string) => {
    if (senderRef.current) {
      senderRef.current.cancel(id);
    }
    // Forward cancel signal to receiver over DataChannel if open
    if (rtcRef.current?.dataChannel && rtcRef.current.dataChannel.readyState === 'open') {
      try {
        rtcRef.current.dataChannel.send(
          JSON.stringify({ type: 'FILE_CANCEL', id, reason: 'Cancelled by user' })
        );
      } catch (e) {
        console.warn('Failed to send cancel message', e);
      }
    }
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t))
    );
  }, []);

  const handleJoinSession = (targetSessionId: string) => {
    const match = targetSessionId.match(/\/s\/([a-zA-Z0-9_-]+)/i);
    let cleanId = (match ? match[1] : targetSessionId.trim()).toLowerCase();
    const rawClean = cleanId.replace(/[^a-z0-9]/g, '');
    if (rawClean.startsWith('rm') && rawClean.length === 10) {
      cleanId = `rm-${rawClean.slice(2, 6)}-${rawClean.slice(6, 10)}`;
    } else if (rawClean.length === 8) {
      cleanId = `rm-${rawClean.slice(0, 4)}-${rawClean.slice(4, 8)}`;
    }
    window.history.pushState({}, '', `/s/${cleanId}`);
    setSessionId(cleanId);
    setViewState('connecting');
    initSession(cleanId, 'guest');
  };

  const handleCancelConnecting = () => {
    cleanupAll();
    window.history.pushState({}, '', '/');
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setRemainingSeconds(600);
    setViewState('waiting');
    const isMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640);
    if (!isMobile) {
      initSession(newSessionId, 'host');
    }
  };

  const handleSessionDissolve = () => {
    cleanupAll();
    setViewState('dissolved');
  };

  const handleStartNewSession = () => {
    window.history.pushState({}, '', '/');
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setRemainingSeconds(600);
    setTransfers([]);
    setViewState('waiting');
    initSession(newSessionId, 'host');
  };

  const cleanupAll = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (receiverRef.current) {
      receiverRef.current.dissolveSession();
      receiverRef.current = null;
    }
    if (senderRef.current) {
      senderRef.current = null;
    }
    if (rtcRef.current) {
      rtcRef.current.close();
      rtcRef.current = null;
    }
    if (signalingRef.current) {
      signalingRef.current.close();
      signalingRef.current = null;
    }
    thumbnailsRef.current.forEach((url) => URL.revokeObjectURL(url));
    thumbnailsRef.current.clear();
    mobileManager.cleanup();
  };

  const roomCode = formatRoomCode(sessionId);

  return (
    <div className="app-shell">
      <Header roomCode={roomCode} />

      <main className="flex-1 flex flex-col min-h-0 relative">
        {viewState === 'waiting' && (
          <WaitingView
            sessionId={sessionId}
            roomCode={roomCode}
            remainingSeconds={remainingSeconds}
            onJoinSession={handleJoinSession}
            onStartHosting={() => initSession(sessionId, 'host')}
          />
        )}

        {viewState === 'connecting' && (
          <ConnectingView roomCode={roomCode} onCancel={handleCancelConnecting} />
        )}

        {viewState === 'connected' && (
          <ConnectedView
            remainingSeconds={remainingSeconds}
            transfers={transfers}
            roomCode={roomCode}
            connectionType={connectionType}
            verificationKey={verificationKey}
            onEndSession={handleSessionDissolve}
            onSendFiles={handleSendFiles}
            onCancelTransfer={handleCancelTransfer}
          />
        )}

        {viewState === 'dissolved' && (
          <DissolvedView onStartNewSession={handleStartNewSession} />
        )}
      </main>

      <Footer />
    </div>
  );
};

export default App;
