import React, { useEffect, useState } from 'react';

interface ConnectingViewProps {
  roomCode?: string;
  onCancel?: () => void;
}

export const ConnectingView: React.FC<ConnectingViewProps> = ({ roomCode, onCancel }) => {
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="flex-1 flex flex-col items-center justify-center min-h-0 px-4 py-8">
      {/* Centered max-w-[400px] #111113 Instrument Panel */}
      <div className="w-full max-w-[400px] rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-8 flex flex-col items-center text-center">
        {/* 18px monochrome stroke spinner */}
        <div className="w-10 h-10 rounded-[8px] bg-[#18181B] border border-[#27272A] flex items-center justify-center mb-4">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className="spinner-quiet text-[#F4F4F5]"
          >
            <circle cx="9" cy="9" r="7" stroke="#27272A" strokeWidth="1.6" />
            <path d="M9 2A7 7 0 0 1 16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          </svg>
        </div>

        <h2 className="text-[14px] font-medium text-[#F4F4F5] tracking-[-0.015em]">
          Establishing P2P Tunnel…
        </h2>

        <p className="mt-2 mono-num text-[11px] text-[#71717A] tracking-wider uppercase">
          {secondsElapsed >= 6
            ? 'Negotiating ICE candidates (STUN/TURN relay)…'
            : 'DTLS-SRTP • ICE CANDIDATE EXCHANGE'}
        </p>

        {secondsElapsed >= 12 && (
          <p className="mt-3 text-[11px] text-[#A1A1AA] max-w-[280px] leading-relaxed">
            Traversing NAT. Make sure the host tab remains open on the other device.
          </p>
        )}

        {roomCode && (
          <div className="mt-4 px-2 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] mono-num text-[11px] text-[#A1A1AA]">
            {roomCode}
          </div>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-6 px-4 py-1.5 rounded-[6px] bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] text-[11px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors cursor-pointer select-none"
          >
            Cancel & Return
          </button>
        )}
      </div>
    </section>
  );
};
