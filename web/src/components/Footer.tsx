import React from 'react';

export const Footer: React.FC = () => {
  const commitSha = import.meta.env.VITE_COMMIT_SHA || 'dev';

  return (
    <footer className="shrink-0 border-t border-hairline px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 bg-bg text-zinc-500 text-xs">
      <p className="text-center sm:text-left">
        No servers store your files. Session dies when this tab closes.
      </p>
      <div className="flex items-center gap-2 mono-num text-[11px] text-zinc-600">
        <span>COMMIT</span>
        <span className="text-zinc-400 px-1.5 py-0.5 rounded bg-surface border border-hairline">
          {commitSha.substring(0, 7)}
        </span>
      </div>
    </footer>
  );
};
