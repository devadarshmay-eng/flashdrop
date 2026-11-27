import React from 'react';

export const Footer: React.FC = () => {
  const commitSha = import.meta.env.VITE_COMMIT_SHA || 'dev';

  return (
    <footer className="w-full max-w-4xl mx-auto border-t border-[#232327] pt-3 pb-3.5 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-[#71717A] shrink-0">
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1 text-[11px] text-[#71717A]">
        <span>Zero server storage (0 B stored)</span>
        <span className="text-[#3F3F46]">•</span>
        <span>No file size limits</span>
        <span className="text-[#3F3F46]">•</span>
        <span>Session dies on tab close</span>
      </div>
      <div className="flex items-center gap-1.5 mono-num text-[11px] text-[#52525B]">
        <span>SHA</span>
        <span className="text-[#A1A1AA] px-1.5 py-0.5 rounded-[4px] bg-[#111113] border border-[#232327]">
          {commitSha.substring(0, 7)}
        </span>
      </div>
    </footer>
  );
};
