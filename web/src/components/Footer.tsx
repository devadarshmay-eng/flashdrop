import React from 'react';

export const Footer: React.FC = () => {
  const commitSha = import.meta.env.VITE_COMMIT_SHA || 'dev';

  return (
    <footer className="w-full max-w-4xl mx-auto border-t border-[#232327] pt-3 pb-3.5 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-[#71717A] shrink-0">
      <p className="text-center sm:text-left text-[11px] text-[#71717A]">
        No servers store your files. Session dies when this tab closes.
      </p>
      <div className="flex items-center gap-1.5 mono-num text-[11px] text-[#52525B]">
        <span>SHA</span>
        <span className="text-[#A1A1AA] px-1.5 py-0.5 rounded-[4px] bg-[#111113] border border-[#232327]">
          {commitSha.substring(0, 7)}
        </span>
      </div>
    </footer>
  );
};
