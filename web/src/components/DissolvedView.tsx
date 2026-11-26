import React from 'react';

interface DissolvedViewProps {
  onStartNewSession: () => void;
}

export const DissolvedView: React.FC<DissolvedViewProps> = ({
  onStartNewSession,
}) => {
  return (
    <section className="flex-1 flex items-center justify-center min-h-0 px-4 py-8">
      {/* Centered max-w-[400px] #111113 Instrument Panel */}
      <div className="w-full max-w-[400px] rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-6">
        <div className="flex items-start gap-3.5">
          {/* Broken-link icon */}
          <div className="w-9 h-9 rounded-[6px] bg-[#18181B] border border-[#27272A] flex items-center justify-center text-[#71717A] shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3L15 15M6.5 6.5L4.5 8.5C3.4 9.6 3.4 11.4 4.5 12.5L5.5 13.5C6.6 14.6 8.4 14.6 9.5 13.5L11.5 11.5M11.5 11.5L13.5 9.5C14.6 8.4 14.6 6.6 13.5 5.5L12.5 4.5C11.4 3.4 9.6 3.4 8.5 4.5L7.5 5.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
              />
            </svg>
          </div>

          <div className="flex-1">
            <h1 className="text-[14px] font-medium text-[#F4F4F5] leading-snug">
              Session Dissolved
            </h1>
            <p className="mt-1 text-[12px] text-[#71717A] leading-relaxed">
              All temporary keys, WebRTC channels, and session links have been wiped.
            </p>
            <p className="mt-2 mono-num text-[11px] text-[#A1A1AA] tracking-wider uppercase">
              KEY MATERIAL ZEROED
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="start-new-session-btn"
          onClick={onStartNewSession}
          className="mt-5 w-full py-2.5 px-4 rounded-[6px] bg-[#FF4D00] text-[#0A0A0B] text-[13px] font-semibold tracking-[-0.01em] hover:bg-[#E64500] transition-colors cursor-pointer select-none"
        >
          Start New Session
        </button>
      </div>
    </section>
  );
};
