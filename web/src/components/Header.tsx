import React from 'react';

interface HeaderProps {
  roomCode?: string;
}

export const Header: React.FC<HeaderProps> = ({ roomCode }) => {
  return (
    <header className="w-full max-w-4xl mx-auto flex items-center justify-between gap-4 border-b border-[#26262A] pb-4 px-4 sm:px-6 pt-4 shrink-0">
      <div className="flex items-center gap-2.5">
        {/* 24x24 crisp geometric lightning SVG */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="text-[#F4F4F5] shrink-0"
        >
          <path
            d="M13.5 2.5L5.5 13H12L10.5 21.5L18.5 11H12L13.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="miter"
          />
        </svg>
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-[#F4F4F5]">FlashDrop</span>
        {roomCode && (
          <>
            <span className="hidden sm:inline-block text-[#3F3F46] select-none">/</span>
            <span className="hidden sm:inline-block mono-num text-[12px] text-[#71717A] tracking-[0.02em]">
              {roomCode}
            </span>
          </>
        )}
      </div>

      <div className="px-2.5 py-1 rounded-[6px] bg-[#141416] border border-[#26262A] text-[11px] font-medium tracking-[0.06em] text-[#A1A1AA] uppercase whitespace-nowrap">
        EPHEMERAL • P2P ENCRYPTED
      </div>
    </header>
  );
};
