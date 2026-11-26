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
      width: 208,
      margin: 1,
      color: {
        dark: '#0A0A0B',
        light: '#F4F4F5',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [sessionUrl]);

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
      {/* Center QR framed by 4 sharp corner brackets #52525B */}
      <div className="relative p-5">
        <span className="bracket bracket-tl"></span>
        <span className="bracket bracket-tr"></span>
        <span className="bracket bracket-bl"></span>
        <span className="bracket bracket-br"></span>
        <div className="p-3 rounded-md bg-[#F4F4F5] flex items-center justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Scan to join session"
              width={208}
              height={208}
              className="w-[208px] h-[208px] block"
            />
          ) : (
            <div className="w-[208px] h-[208px] bg-[#E4E4E7] animate-pulse" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Monospace 10:00 countdown */}
        <div className="mono-num text-4xl font-medium tracking-tight text-[#F4F4F5]">
          {formatTime(remainingSeconds)}
        </div>
        {/* Room Code */}
        <div className="mono-num text-[11px] text-zinc-500 tracking-wider">
          ROOM {roomCode}
        </div>
      </div>

      {/* Instruction */}
      <p className="text-sm text-zinc-400 text-center max-w-xs">
        Scan with your phone camera to open a direct channel to this tab.
      </p>
    </section>
  );
};
