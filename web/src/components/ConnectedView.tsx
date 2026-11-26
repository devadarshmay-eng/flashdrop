import React, { useRef, useState } from 'react';
import { TransferProgress, triggerDownload } from '../lib';

interface ConnectedViewProps {
  remainingSeconds: number;
  transfers: TransferProgress[];
  roomCode?: string;
  onEndSession: () => void;
  onSendFiles: (files: FileList | File[]) => void;
}

export const ConnectedView: React.FC<ConnectedViewProps> = ({
  remainingSeconds,
  transfers,
  roomCode,
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
    <section className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0 px-4 sm:px-6 py-4 gap-4">
      {/* Workspace Status Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[#26262A] pb-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" aria-hidden="true"></span>
            <span className="text-[13px] font-medium text-[#F4F4F5] truncate">Connected (Direct P2P)</span>
          </div>
          {roomCode && (
            <>
              <span className="hidden md:inline-block text-[#3F3F46]">/</span>
              <span className="hidden md:inline-block mono-num text-[12px] text-[#71717A]">{roomCode}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="mono-num text-[13px] font-medium text-[#D4D4D8] tabular-nums">
            {formatTime(remainingSeconds)}
          </span>
          <button
            type="button"
            onClick={onEndSession}
            className="px-2.5 py-1.5 rounded-[6px] bg-[#141416] border border-[#26262A] text-[12px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] hover:border-[#3F3F46] transition-colors duration-150 cursor-pointer"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Desktop Dropzone (hidden on mobile) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to select files"
        className={`hidden sm:flex flex-col items-center justify-center w-full py-8 px-6 rounded-[6px] bg-[#141416] border border-dashed transition-colors duration-150 cursor-pointer shrink-0 select-none ${
          isDragOver
            ? 'border-zinc-400 bg-[#18181B]'
            : 'border-[#26262A] hover:border-[#3F3F46]'
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          className="text-[#8A8A93] mb-2"
        >
          <path
            d="M9 12.5V3.5M9 3.5L5.5 7M9 3.5L12.5 7M3 14.5H15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
        <p className="text-[13px] font-medium text-[#E4E4E7]">
          Drop files to transmit directly to paired device
        </p>
        <p className="mt-1 text-[12px] text-[#71717A]">
          Click to select files • Streams peer-to-peer without disk buffering
        </p>
      </div>

      {/* Mobile Primary Action Button (full-width #FF4D00, hidden on desktop) */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex sm:hidden items-center justify-center gap-2 w-full py-3.5 px-4 rounded-[6px] bg-[#FF4D00] text-[#0A0A0B] text-[14px] font-semibold tracking-[-0.01em] hover:bg-[#E64500] transition-colors duration-150 cursor-pointer shrink-0"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 11.5V3M8 3L4.75 6.25M8 3L11.25 6.25M2.5 13H13.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
        <span>Send Files</span>
      </button>

      {/* Transfer List Container */}
      <div className="flex-1 flex flex-col min-h-0 rounded-[6px] bg-[#141416] border border-[#26262A] overflow-hidden">
        {/* Dense Table Header */}
        <div className="px-3.5 py-2.5 border-b border-[#26262A] flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.06em] text-[#71717A] shrink-0">
          <span>Transfers</span>
          <span className="mono-num text-[11px] text-[#71717A]">
            {transfers.length} {transfers.length === 1 ? 'ITEM' : 'ITEMS'}
          </span>
        </div>

        {/* Transfer Rows */}
        <div className="flex-1 overflow-y-auto transfer-scroll divide-y divide-[#26262A]">
          {transfers.length === 0 ? (
            <div className="flex items-center justify-center h-full py-10 text-center text-xs text-zinc-600">
              No transfers yet. Drop or select files to begin stream.
            </div>
          ) : (
            transfers.map((t) => {
              const isSend = t.direction === 'send';
              const isDone = t.status === 'completed';
              const percent = Math.min(100, Math.max(0, Math.round(t.percentage)));

              return (
                <div
                  key={t.id}
                  className="px-3.5 py-3 flex flex-col gap-2 hover:bg-[#18181B]/50 transition-colors duration-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Direction Arrow */}
                      <span className="shrink-0 text-zinc-500">
                        {isSend ? (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#FF4D00]">
                            <path d="M8 12V4M8 4L4.5 7.5M8 4L11.5 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#10B981]">
                            <path d="M8 4V12M8 12L4.5 8.5M8 12L11.5 8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
                          </svg>
                        )}
                      </span>

                      {/* Truncated Filename */}
                      <span className="text-[13px] font-medium text-[#F4F4F5] truncate">
                        {t.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Tabular File Size */}
                      <span className="mono-num text-[12px] text-[#8A8A93]">
                        {formatSize(t.size)}
                      </span>

                      {/* Speed in MB/s */}
                      {t.status === 'transferring' && (
                        <span className="mono-num text-[11px] text-[#FF4D00]">
                          {t.speedMBs}
                        </span>
                      )}

                      {/* Save Button for Completed Received Files */}
                      {!isSend && isDone && (
                        <button
                          type="button"
                          onClick={() => handleSaveClick(t)}
                          className="px-2.5 py-1 rounded-[4px] bg-[#0A0A0B] border border-[#26262A] text-[12px] font-medium text-[#F4F4F5] hover:border-[#3F3F46] hover:bg-[#141416] transition-colors duration-150 cursor-pointer"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar: 3px height with #FF4D00 fill */}
                  <div className="w-full h-[3px] bg-[#26262A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF4D00] transition-all duration-150"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
