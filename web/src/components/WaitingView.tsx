import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface WaitingViewProps {
  sessionId: string;
  roomCode: string;
  remainingSeconds: number;
}

export const WaitingView: React.FC<WaitingViewProps> = ({
  sessionId,
  roomCode,
  remainingSeconds,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(Math.max(0, totalSecs) / 60);
    const secs = Math.max(0, totalSecs) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sessionUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/s/${sessionId}`
    : `/s/${sessionId}`;

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

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(sessionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <section className="flex-1 flex flex-col items-center justify-center min-h-0 py-6 px-4">
      {/* Primary Instrument Panel */}
      <div className="w-full max-w-[400px] rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden flex flex-col">
        {/* Top Strip: Monospace room code + Copy Link button */}
        <div className="px-4 py-3 border-b border-[#232327] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00]"></span>
            <span className="mono-num text-[12px] font-medium text-[#F4F4F5] tracking-[0.02em]">
              {roomCode}
            </span>
          </div>

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
            <span className="mono-num text-[13px] font-medium text-[#F4F4F5] tabular-nums">
              {formatTime(remainingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] text-[10px] font-mono uppercase tracking-[0.05em] text-[#A1A1AA]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00] animate-pulse"></span>
            <span>AWAITING PEER</span>
          </div>
        </div>
      </div>
    </section>
  );
};
