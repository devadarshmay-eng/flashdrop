import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

interface WaitingViewProps {
  sessionId: string;
  roomCode: string;
  remainingSeconds: number;
  onJoinSession?: (sessionId: string) => void;
  onStartHosting?: () => void;
}

export const WaitingView: React.FC<WaitingViewProps> = ({
  sessionId,
  roomCode,
  remainingSeconds,
  onJoinSession,
  onStartHosting,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [showQrMode, setShowQrMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
    return !mobile;
  });

  // Mobile code join state
  const [inputCode, setInputCode] = useState<string>('');
  const [codeError, setCodeError] = useState<string>('');

  // Camera scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const scannedRef = useRef<boolean>(false);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(Math.max(0, totalSecs) / 60);
    const secs = Math.max(0, totalSecs) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColorClass = (secs: number) => {
    if (secs < 15) return 'text-[#EF4444]';
    if (secs < 60) return 'text-[#F59E0B]';
    return 'text-[#F4F4F5]';
  };

  const sessionUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/s/${sessionId}`
    : `/s/${sessionId}`;

  // Generate QR code for desktop or phone-to-phone host
  useEffect(() => {
    QRCode.toDataURL(sessionUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0A0A0B',
        light: '#F4F4F5',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [sessionUrl]);

  // Copy link handler
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(sessionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  // Keyboard shortcut: Cmd+C / Ctrl+C to copy session link on desktop Waiting state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && showQrMode) {
        // Only if user isn't selecting text inside an input
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          return;
        }
        handleCopyLink();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionUrl, showQrMode]);

  // Room code auto-formatter (e.g. typing "7f4a92c1" -> "RM-7F4A-92C1")
  const handleCodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();
    setCodeError('');

    // If user pasted a full URL
    if (val.includes('/S/')) {
      setInputCode(val);
      return;
    }

    // Strip non-alphanumeric except existing hyphen
    const clean = val.replace(/[^A-Z0-9]/g, '');
    let formatted = clean;

    if (clean.startsWith('RM')) {
      const rest = clean.slice(2);
      if (rest.length <= 4) {
        formatted = `RM-${rest}`;
      } else {
        formatted = `RM-${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
      }
    } else if (clean.length > 0) {
      if (clean.length <= 4) {
        formatted = `RM-${clean}`;
      } else {
        formatted = `RM-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
      }
    }

    setInputCode(formatted);
  };

  const handleConnectByCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = inputCode.trim();
    if (!val) {
      setCodeError('Enter a room code or session link');
      return;
    }

    // Check if full URL
    const urlMatch = val.match(/\/s\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch && urlMatch[1]) {
      if (onJoinSession) {
        onJoinSession(urlMatch[1]);
      }
      return;
    }

    // Check if formatted room code e.g. RM-XXXX-XXXX
    const codeMatch = val.match(/^RM-([A-Z0-9]{4})-([A-Z0-9]{4})$/i);
    if (codeMatch) {
      const normalized = `rm-${codeMatch[1].toLowerCase()}-${codeMatch[2].toLowerCase()}`;
      if (onJoinSession) {
        onJoinSession(normalized);
      }
      return;
    }

    // Strip everything except alphanumeric
    const rawClean = val.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (rawClean.startsWith('rm') && rawClean.length === 10) {
      const normalized = `rm-${rawClean.slice(2, 6)}-${rawClean.slice(6, 10)}`;
      if (onJoinSession) {
        onJoinSession(normalized);
      }
      return;
    }

    // Check if 8 alphanumeric chars
    if (rawClean.length === 8) {
      const normalized = `rm-${rawClean.slice(0, 4)}-${rawClean.slice(4, 8)}`;
      if (onJoinSession) {
        onJoinSession(normalized);
      }
      return;
    }

    setCodeError('Invalid code. Format: RM-XXXX-XXXX');
  };

  // Start Inline Camera Scanner
  const startCameraScanner = async () => {
    setIsScanning(true);
    setScannerError('');
    scannedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        requestAnimationFrame(scanVideoFrame);
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable', err);
      setScannerError('Camera access unavailable. Enter code manually below.');
      stopCameraScanner();
    }
  };

  const stopCameraScanner = () => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const scanVideoFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      scanLoopRef.current = requestAnimationFrame(scanVideoFrame);
      return;
    }

    // Try native BarcodeDetector if available in browser
    if (typeof (window as any).BarcodeDetector === 'function') {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          if (handleScannedValue(rawValue)) return;
        }
      } catch {
        // Fallback to jsQR canvas processing
      }
    }

    // jsQR canvas fallback
    const canvas = canvasRef.current || document.createElement('canvas');
    if (!canvasRef.current) canvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code && code.data) {
        if (handleScannedValue(code.data)) return;
      }
    }

    scanLoopRef.current = requestAnimationFrame(scanVideoFrame);
  };

  const handleScannedValue = (rawValue: string): boolean => {
    if (scannedRef.current) return true;
    const match = rawValue.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      scannedRef.current = true;
      stopCameraScanner();
      if (onJoinSession) {
        onJoinSession(match[1]);
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  return (
    <section className="flex-1 flex flex-col items-center justify-center min-h-0 py-6 px-4">
      {/* Viewport View: Mobile Entry vs QR Instrument Panel */}
      {!showQrMode ? (
        /* Mobile-Ready Entry Panel */
        <div className="w-full max-w-[400px] rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#232327] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00]"></span>
              <span className="text-[13px] font-semibold tracking-[-0.015em] text-[#F4F4F5]">
                Pair Device
              </span>
            </div>
            <span className="mono-num text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] text-[#A1A1AA] uppercase">
              P2P TUNNEL
            </span>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {/* Inline Camera Viewfinder (if active) */}
            {isScanning ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-full aspect-square rounded-[8px] overflow-hidden bg-[#0A0A0B] border border-[#232327] flex items-center justify-center">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {/* Viewfinder crosshairs */}
                  <div className="absolute inset-8 border border-dashed border-[#FF4D00]/70 rounded-[6px] pointer-events-none flex items-center justify-center">
                    <span className="mono-num text-[10px] text-[#FF4D00] bg-[#0A0A0B]/80 px-1.5 py-0.5 rounded-[3px]">
                      AIM AT DESKTOP QR
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={stopCameraScanner}
                  className="w-full py-2 px-3 rounded-[6px] bg-[#18181B] border border-[#27272A] text-[12px] font-medium text-[#D4D4D8] hover:text-[#F4F4F5] transition-colors cursor-pointer"
                >
                  Close Camera Viewfinder
                </button>
              </div>
            ) : (
              /* Scan QR Button */
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={startCameraScanner}
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-[6px] bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] text-[#F4F4F5] text-[13px] font-medium transition-colors cursor-pointer select-none"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-[#FF4D00]">
                    <path
                      d="M2.5 5.5V3.5C2.5 2.95 2.95 2.5 3.5 2.5H5.5M10.5 2.5H12.5C13.05 2.5 13.5 2.95 13.5 3.5V5.5M13.5 10.5V12.5C13.5 13.05 13.05 13.5 12.5 13.5H10.5M5.5 13.5H3.5C2.95 13.5 2.5 13.05 2.5 12.5V10.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="square"
                    />
                  </svg>
                  <span>Scan QR Code</span>
                </button>
                <p className="text-[11px] text-[#71717A] text-center">
                  Tip: Your phone's native Camera app scans desktop directly.
                </p>
                {scannerError && (
                  <p className="text-[11px] text-[#EF4444] text-center">
                    {scannerError}
                  </p>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-2">
              <span className="flex-1 h-[1px] bg-[#232327]"></span>
              <span className="mono-num text-[10px] text-[#71717A] uppercase tracking-wider">
                OR ENTER CODE
              </span>
              <span className="flex-1 h-[1px] bg-[#232327]"></span>
            </div>

            {/* Manual Code Input Form */}
            <form onSubmit={handleConnectByCode} className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputCode}
                  onChange={handleCodeInputChange}
                  placeholder="RM-XXXX-XXXX"
                  aria-label="Room Code"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  className="flex-1 px-3 py-2.5 rounded-[6px] bg-[#0A0A0B] border border-[#232327] focus:border-[#FF4D00] text-[13px] font-mono tracking-[0.05em] text-[#F4F4F5] placeholder-[#52525B] outline-none transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-[6px] bg-[#FF4D00] text-[#0A0A0B] text-[13px] font-semibold hover:bg-[#E64500] transition-colors cursor-pointer select-none shrink-0"
                >
                  Connect
                </button>
              </div>
              {codeError && (
                <p className="text-[11px] text-[#EF4444]">
                  {codeError}
                </p>
              )}
            </form>
          </div>

          {/* Secondary Toggle: Show QR on this device */}
          <div className="px-5 py-3 border-t border-[#232327] bg-[#0E0E10] flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                setShowQrMode(true);
                if (onStartHosting) onStartHosting();
              }}
              className="text-[12px] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors cursor-pointer select-none"
            >
              Show QR code on this device instead →
            </button>
          </div>
        </div>
      ) : (
        /* Desktop QR Instrument Panel */
        <div className="w-full max-w-[400px] rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden flex flex-col">
          {/* Top Strip: Monospace room code + Copy Link button with shortcut */}
          <div className="px-4 py-3 border-b border-[#232327] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00]"></span>
              <span className="mono-num text-[12px] font-medium text-[#F4F4F5] tracking-[0.02em]">
                {roomCode}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="Copy session URL"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] text-[11px] font-medium text-[#D4D4D8] hover:text-[#F4F4F5] transition-colors cursor-pointer select-none"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#10B981" strokeWidth="1.6" strokeLinecap="square" />
                    </svg>
                    <span className="text-[#10B981]">Copied</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-[#A1A1AA]">
                      <path
                        d="M5.5 3.5H12.5V10.5M3.5 5.5H10.5V12.5H3.5V5.5Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="square"
                      />
                    </svg>
                    <span>Copy URL</span>
                  </>
                )}
              </button>

              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] font-mono text-[10px] text-[#71717A]">
                ⌘C
              </span>
            </div>
          </div>

          {/* Center Stage: QR Code framed by 4 sharp 14px corner brackets + 2-line instruction */}
          <div className="p-6 flex flex-col items-center">
            <div className="relative p-3.5 mb-5">
              <span className="bracket bracket-tl"></span>
              <span className="bracket bracket-tr"></span>
              <span className="bracket bracket-bl"></span>
              <span className="bracket bracket-br"></span>
              <div className="bg-[#F4F4F5] p-2 rounded-[4px] border border-[#232327] flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`Scan to connect to ${roomCode}`}
                    data-session-url={sessionUrl}
                    data-session-id={sessionId}
                    width={200}
                    height={200}
                    className="w-[200px] h-[200px] block qr-code-image select-none"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] bg-[#E4E4E7] animate-pulse" />
                )}
              </div>
            </div>

            <h2 className="text-[14px] font-medium text-[#F4F4F5] tracking-[-0.015em] text-center">
              Scan to pair mobile device
            </h2>
            <p className="mt-1.5 text-[12px] text-[#71717A] text-center max-w-[280px] leading-relaxed">
              Point your phone camera at the code to open a direct WebRTC tunnel.
            </p>
          </div>

          {/* Bottom Telemetry Strip: Live 10:00 countdown + AWAITING PEER badge */}
          <div className="px-4 py-3 border-t border-[#232327] bg-[#0E0E10] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider">
                TTL
              </span>
              <span className={`mono-num text-[13px] font-medium tabular-nums ${getTimerColorClass(remainingSeconds)}`}>
                {formatTime(remainingSeconds)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQrMode(false)}
                className="text-[11px] text-[#71717A] hover:text-[#D4D4D8] cursor-pointer mr-1 transition-colors select-none"
              >
                Join with code →
              </button>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] text-[10px] font-mono uppercase tracking-[0.05em] text-[#A1A1AA]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00] animate-pulse"></span>
                <span>AWAITING PEER</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
