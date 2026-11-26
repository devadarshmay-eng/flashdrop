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
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0A0A0B',
        light: '#F4F4F5',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [sessionUrl]);

  return (
    <section className="flex-1 flex flex-col items-center justify-center min-h-0 py-6 px-4">
      <div className="flex flex-col items-center">
        {/* QR Frame with Sharp Technical Corner Brackets (14px-18px, 1.5px border #52525B) */}
        <div className="relative p-4 sm:p-5">
          <span className="bracket bracket-tl"></span>
          <span className="bracket bracket-tr"></span>
          <span className="bracket bracket-bl"></span>
          <span className="bracket bracket-br"></span>
          <div className="bg-[#F4F4F5] p-3 rounded-[4px] border border-[#26262A] flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Scan to connect to ${roomCode}`}
                width={208}
                height={208}
                className="w-[188px] h-[188px] sm:w-[208px] sm:h-[208px] block"
              />
            ) : (
              <div className="w-[188px] h-[188px] sm:w-[208px] sm:h-[208px] bg-[#E4E4E7] animate-pulse" />
            )}
          </div>
        </div>

        {/* Live Monospace Countdown Timer & Room ID */}
        <div className="mt-6 flex items-center gap-3">
          <span className="mono-num text-4xl sm:text-[28px] font-medium tracking-[0.04em] text-[#F4F4F5] tabular-nums">
            {formatTime(remainingSeconds)}
          </span>
          <span className="h-4 w-[1px] bg-[#26262A]"></span>
          <span className="mono-num text-[12px] text-[#71717A] tracking-wider">
            {roomCode}
          </span>
        </div>

        {/* Single Quiet Instruction Line */}
        <p className="mt-2.5 text-[13px] text-[#8A8A93] text-center max-w-md">
          Scan with your phone camera to open a direct peer-to-peer channel.
        </p>
      </div>
    </section>
  );
};
