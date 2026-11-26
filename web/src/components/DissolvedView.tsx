import React from 'react';

interface DissolvedViewProps {
  onStartNewSession: () => void;
}

export const DissolvedView: React.FC<DissolvedViewProps> = ({
  onStartNewSession,
}) => {
  return (
    <section className="flex-1 flex items-center justify-center min-h-0 px-4 py-8">
      {/* Centered matte card (max-w-md bg-[#141416] border border-[#26262A] rounded-[6px] p-6) */}
      <div className="w-full max-w-md rounded-[6px] bg-[#141416] border border-[#26262A] p-6">
        <div className="flex items-start gap-3">
          {/* Broken-link icon (<=18px, 1.6px stroke, no fill) */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
            className="text-[#71717A] shrink-0 mt-0.5"
          >
            <path
              d="M3 3L15 15M6.5 6.5L4.5 8.5C3.4 9.6 3.4 11.4 4.5 12.5L5.5 13.5C6.6 14.6 8.4 14.6 9.5 13.5L11.5 11.5M11.5 11.5L13.5 9.5C14.6 8.4 14.6 6.6 13.5 5.5L12.5 4.5C11.4 3.4 9.6 3.4 8.5 4.5L7.5 5.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="square"
            />
          </svg>
          <div>
            <h1 className="text-[14px] font-medium text-[#F4F4F5] leading-snug">
              Session Dissolved. All temporary keys and links have been wiped.
            </h1>
            <p className="mt-1.5 mono-num text-[11px] text-[#71717A]">
              KEY MATERIAL ZEROED • CHANNEL CLOSED
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartNewSession}
          className="mt-5 w-full py-2.5 px-4 rounded-[6px] bg-[#FF4D00] text-[#0A0A0B] text-[13px] font-semibold tracking-[-0.01em] hover:bg-[#E64500] transition-colors duration-150 cursor-pointer"
        >
          Start New Session
        </button>
      </div>
    </section>
  );
};
