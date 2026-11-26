import React from 'react';

interface ConnectingViewProps {
  roomCode?: string;
}

export const ConnectingView: React.FC<ConnectingViewProps> = ({ roomCode }) => {
  return (
    <section className="flex-1 flex flex-col items-center justify-center min-h-0 px-4 py-8">
      <div className="flex flex-col items-center gap-3.5">
        {/* Centered minimal 18px stroke spinner (1.6px stroke, #A1A1AA) */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          className="spinner-quiet text-[#A1A1AA]"
        >
          <circle cx="9" cy="9" r="7" stroke="#26262A" strokeWidth="1.6" />
          <path d="M9 2A7 7 0 0 1 16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
        </svg>

        <p className="text-[14px] font-medium text-[#D4D4D8] tracking-[-0.01em]">
          Establishing P2P Tunnel…
        </p>

        <p className="mono-num text-[11px] text-[#52525B] tracking-wider uppercase">
          DTLS-SRTP / ICE NEGOTIATION
        </p>

        {roomCode && (
          <span className="mono-num text-[11px] text-[#71717A] mt-1">
            {roomCode}
          </span>
        )}
      </div>
    </section>
  );
};
