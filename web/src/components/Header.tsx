import React from 'react';

interface HeaderProps {
  roomId?: string;
}

export const Header: React.FC<HeaderProps> = ({ roomId }) => {
  return (
    <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-hairline shrink-0 bg-bg">
      <div className="flex items-center gap-2.5">
        {/* 24x24 geometric lightning SVG mark */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F4F4F5"
          strokeWidth="1.6"
          strokeLinejoin="miter"
          aria-hidden="true"
        >
          <path d="M13 3 5 13h6l-1 8 8-10h-6z" />
        </svg>
        <span className="text-[15px] font-semibold tracking-tight text-[#F4F4F5]">FlashDrop</span>
      </div>

      <div className="flex items-center gap-3">
        {roomId && (
          <span className="hidden sm:inline-block mono-num text-[11px] text-zinc-500">
            {roomId}
          </span>
        )}
        <div className="mono-num text-[11px] tracking-wide text-zinc-400 border border-hairline rounded-md px-2.5 py-1 bg-surface">
          EPHEMERAL • P2P ENCRYPTED
        </div>
      </div>
    </header>
  );
};
