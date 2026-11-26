import React, { useRef, useState } from 'react';
import { TransferProgress, triggerDownload } from '../lib';

interface ConnectedViewProps {
  remainingSeconds: number;
  transfers: TransferProgress[];
  onEndSession: () => void;
  onSendFiles: (files: FileList | File[]) => void;
}

export const ConnectedView: React.FC<ConnectedViewProps> = ({
  remainingSeconds,
  transfers,
  onEndSession,
  onSendFiles,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(Math.max(0, totalSecs) / 60);
    const secs = Math.max(0, totalSecs) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onSendFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSendFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleSaveClick = (t: TransferProgress) => {
    if (t.objectUrl) {
      triggerDownload(t.objectUrl, t.name);
    } else if (t.blob) {
      const url = URL.createObjectURL(t.blob);
      triggerDownload(url, t.name);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  return (
    <section className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 gap-4">
      {/* Top Status Bar in Workspace */}
      <div className="flex items-center justify-between gap-3 text-[13px] shrink-0">
        <div className="flex items-center gap-2">
          {/* Green connected dot */}
          <span className="inline-block w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
          <span className="text-zinc-200 font-medium">Connected (Direct P2P)</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="mono-num text-zinc-300 font-medium">{formatTime(remainingSeconds)}</span>
          <button
            onClick={onEndSession}
            className="text-zinc-500 hover:text-zinc-300 text-[13px] bg-transparent border-0 cursor-pointer transition-colors duration-150"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Desktop Full-Bleed Dropzone & Mobile CTA */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 min-h-[168px] flex flex-col items-center justify-center gap-3 text-center p-6 border rounded-lg transition-colors duration-150 ${
          isDragOver
            ? 'border-zinc-400 bg-[#141416]'
            : 'border-dashed border-[#3A3A40] bg-[#0A0A0B]/40 hover:border-zinc-500'
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#71717A"
          strokeWidth="1.6"
          strokeLinecap="square"
          aria-hidden="true"
        >
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </svg>

        <div className="hidden sm:block text-sm text-zinc-400">
          Drop files anywhere in this area
        </div>

        {/* Mobile full-width #FF4D00 button, compact on desktop */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full sm:w-auto py-3.5 sm:py-2 px-6 rounded-md bg-[#FF4D00] text-[#0A0A0B] text-[15px] sm:text-[13px] font-semibold hover:bg-[#E64500] transition-colors duration-150 cursor-pointer shadow-sm"
        >
          <span className="sm:hidden">Send Files</span>
          <span className="hidden sm:inline">Select files</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {/* Dense hairline-divided transfer list */}
      <div className="bg-[#141416] border border-[#26262A] rounded-lg overflow-hidden shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#26262A] text-[11px] uppercase tracking-wider text-zinc-500">
          <span>Transfers</span>
          <span className="mono-num normal-case">{transfers.length}</span>
        </div>

        <ul className="max-h-[34dvh] overflow-y-auto transfer-scroll divide-y divide-[#26262A]">
          {transfers.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-zinc-600">
              No transfers yet. Drop or select files to start.
            </li>
          ) : (
            transfers.map((t) => {
              const isDone = t.status === 'completed';
              const isSend = t.direction === 'send';

              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-zinc-300"
                >
                  {/* Up / Down arrow */}
                  <div className="shrink-0 text-zinc-500">
                    {isSend ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FF4D00"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-label="Upload"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-label="Download"
                      >
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </svg>
                    )}
                  </div>

                  {/* Filename and Size */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-200 font-medium">
                        {t.name}
                      </span>
                      <span className="mono-num text-[11px] text-zinc-500 shrink-0">
                        {formatSize(t.size)}
                      </span>
                    </div>

                    {/* Inline progress bar */}
                    <div className="w-full h-[3px] bg-[#26262A] rounded-full overflow-hidden">
                      <div
                        className="h-full progress-fill"
                        style={{ width: `${t.percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Speed / Save action */}
                  <div className="shrink-0 w-24 text-right flex justify-end">
                    {isDone ? (
                      <button
                        onClick={() => handleSaveClick(t)}
                        className="flex items-center gap-1.5 py-1 px-2.5 text-xs rounded border border-[#26262A] hover:border-zinc-500 text-zinc-200 bg-transparent transition-colors duration-150 cursor-pointer"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="square"
                          aria-hidden="true"
                        >
                          <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
                        </svg>
                        Save
                      </button>
                    ) : (
                      <span className="mono-num text-xs text-zinc-400">
                        {t.speedMBs || '0.0 MB/s'}
                      </span>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </section>
  );
};
