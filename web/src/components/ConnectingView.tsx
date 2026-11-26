import React from 'react';

interface ConnectingViewProps {
  roomCode?: string;
}

export const ConnectingView: React.FC<ConnectingViewProps> = ({ roomCode }) => {
  return (
    <section className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
      {/* Quiet 18px inline SVG spinner */}
      <svg
        className="spinner-quiet"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#71717A"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 3a9 9 0 0 1 9 9" />
      </svg>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm text-zinc-300">Establishing P2P Tunnel...</span>
        {roomCode && (
          <span className="mono-num text-[11px] text-zinc-500 tracking-wider">
            ROOM {roomCode}
          </span>
        )}
      </div>
    </section>
  );
};
