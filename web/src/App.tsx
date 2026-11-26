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

// Generate formatted human-readable room code like RM-7F4A-92C1 from UUID
function formatRoomCode(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length >= 8) {
    return `RM-${clean.substring(0, 4)}-${clean.substring(4, 8)}`;
  }
  return `RM-${id.substring(0, 8).toUpperCase()}`;
}

function getWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Default to localhost:8787 in dev if not set
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

  const signalingRef = useRef<SignalingClient | null>(null);
  const rtcRef = useRef<PeerConnectionManager | null>(null);
  const senderRef = useRef<FileTransferSender | null>(null);
  const receiverRef = useRef<FileTransferReceiver | null>(null);
  const timerRef = useRef<any>(null);

  // Initialize session based on URL (/s/:sessionId) or root (/)
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/s\/([a-zA-Z0-9-]+)/);

    let activeSessionId = '';
    let role: SessionRole = 'host';

    if (match && match[1]) {
      activeSessionId = match[1];
      role = 'guest';
      setViewState('connecting');
    } else {
      activeSessionId = crypto.randomUUID();
      role = 'host';
      setViewState('waiting');
    }

    setSessionId(activeSessionId);
    initSession(activeSessionId, role);

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

  const initSession = (id: string, role: SessionRole) => {
    cleanupAll();

    const wsUrl = getWsUrl();
    const isHost = role === 'host';

    // 1. Setup PeerConnectionManager
    const rtc = new PeerConnectionManager(
      {
        onDataChannelOpen: () => {
          setViewState('connected');
        },
        onDataChannelClose: () => {
          handleSessionDissolve();
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            setViewState('connected');
          } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            handleSessionDissolve();
          }
        },
      },
      undefined,
      (candidate) => {
        // Send ICE candidate to peer
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
      onOpen: () => {
        // Connected to signaling server
      },
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
      // Guest will receive data channel in rtc.ondatachannel
      const originalSetup = (rtc as any).setupDataChannel.bind(rtc);
      (rtc as any).setupDataChannel = (dc: RTCDataChannel) => {
        originalSetup(dc);
        setupTransferChannels(dc);
      };
    }
  };

  const setupTransferChannels = (dc: RTCDataChannel) => {
    // Setup Sender
    const sender = new FileTransferSender({
      dataChannel: dc,
      onProgress: (p) => updateTransferProgress(p),
      onComplete: (p) => updateTransferProgress(p),
      onError: (_id, err) => console.error('Send error:', err),
    });
    senderRef.current = sender;

    // Setup Receiver
    const receiver = new FileTransferReceiver({
      dataChannel: dc,
      autoDownload: false, // User can click Save or automatic depending on platform
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
        // Second peer arrived! Host initiates Offer
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
      const idx = prev.findIndex((t) => t.id === progress.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = progress;
        return next;
      }
      return [progress, ...prev];
    });
  }, []);

  const handleSendFiles = async (files: FileList | File[]) => {
    if (!senderRef.current) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await senderRef.current.sendFile(file);
      } catch (err) {
        console.error('Failed to send file:', err);
      }
    }
  };

  const handleSessionDissolve = () => {
    cleanupAll();
    setViewState('dissolved');
  };

  const handleStartNewSession = () => {
    // Return to root URL without reload
    window.history.pushState({}, '', '/');
    const newSessionId = crypto.randomUUID();
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
          />
        )}

        {viewState === 'connecting' && (
          <ConnectingView roomCode={roomCode} />
        )}

        {viewState === 'connected' && (
          <ConnectedView
            remainingSeconds={remainingSeconds}
            transfers={transfers}
            roomCode={roomCode}
            onEndSession={handleSessionDissolve}
            onSendFiles={handleSendFiles}
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
