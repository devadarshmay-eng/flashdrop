import React, { useRef, useState, useEffect } from 'react';
import { TransferProgress, triggerDownload } from '../lib';

interface ConnectedViewProps {
  remainingSeconds: number;
  transfers: TransferProgress[];
  roomCode?: string;
  onEndSession: () => void;
  onSendFiles: (files: FileList | File[]) => void;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts.pop()?.toUpperCase() || '';
    return ext.length > 4 ? ext.slice(0, 4) : ext;
  }
  return 'FILE';
}

function formatSize(bytes: number): string {
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
}

export const ConnectedView: React.FC<ConnectedViewProps> = ({
  remainingSeconds,
  transfers,
  roomCode,
  onEndSession,
  onSendFiles,
}) => {
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef<number>(0);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(Math.max(0, totalSecs) / 60);
    const secs = Math.max(0, totalSecs) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Full-viewport drag-and-drop listener
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsWindowDragging(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onSendFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onSendFiles]);

  // Clipboard Paste Support (Ctrl+V / ⌘V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        onSendFiles(e.clipboardData.files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onSendFiles]);

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
      {/* Full-Viewport Drag Overlay */}
      {isWindowDragging && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = 0;
            setIsWindowDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              onSendFiles(e.dataTransfer.files);
            }
          }}
          className="fixed inset-3 rounded-[10px] border border-dashed border-[#FF4D00] bg-[#0A0A0B]/95 z-50 flex flex-col items-center justify-center select-none"
        >
          <div className="w-12 h-12 rounded-[8px] bg-[#18181B] border border-[#27272A] flex items-center justify-center text-[#FF4D00] mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 16V4M12 4L7 9M12 4L17 9M4 20H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
          </div>
          <p className="text-[15px] font-semibold tracking-[-0.015em] text-[#F4F4F5]">
            Release to stream directly to paired device
          </p>
          <p className="mt-1 mono-num text-[11px] text-[#71717A] uppercase tracking-wider">
            END-TO-END ENCRYPTED • 16KB CHUNKS
          </p>
        </div>
      )}

      {/* Workspace Status Bar */}
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0" data-testid="connected-status">
            {/* Crisp 6px #10B981 dot */}
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0"
              data-testid="connected-indicator"
              aria-hidden="true"
            />
            <span className="text-[13px] font-medium text-[#F4F4F5] truncate">
              Connected (Direct P2P)
            </span>
          </div>
          {roomCode && (
            <>
              <span className="hidden md:inline-block text-[#3F3F46]">/</span>
              <span className="hidden md:inline-block mono-num text-[12px] text-[#71717A] tracking-[0.02em]">
                {roomCode}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider">
              TTL
            </span>
            <span className="mono-num text-[13px] font-medium text-[#F4F4F5] tabular-nums">
              {formatTime(remainingSeconds)}
            </span>
          </div>

          <button
            type="button"
            data-testid="end-session-btn"
            onClick={onEndSession}
            className="px-2.5 py-1.5 rounded-[6px] bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] text-[12px] font-medium text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors cursor-pointer select-none"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-input"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Desktop Dropzone (hidden on small viewports) */}
      <div
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to select files"
        className="hidden sm:flex flex-col items-center justify-center w-full py-8 px-6 rounded-[10px] bg-[#111113] border border-dashed border-[#232327] hover:border-[#3F3F46] transition-colors cursor-pointer shrink-0 select-none group"
      >
        <div className="w-9 h-9 rounded-[6px] bg-[#18181B] border border-[#27272A] group-hover:border-[#3F3F46] flex items-center justify-center text-[#A1A1AA] group-hover:text-[#F4F4F5] transition-colors mb-2.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 12.5V3.5M9 3.5L5.5 7M9 3.5L12.5 7M3 14.5H15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          </svg>
        </div>

        <p className="text-[13px] font-medium text-[#F4F4F5] tracking-[-0.01em]">
          Drop files to stream directly to paired device
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[12px] text-[#71717A]">
            Click to select
          </span>
          <span className="text-[#3F3F46]">•</span>
          <span className="px-1.5 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] font-mono text-[11px] text-[#71717A]">
            ⌘V to paste
          </span>
        </div>
      </div>

      {/* Mobile Primary Action Button (full-width #FF4D00, hidden on desktop) */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex sm:hidden items-center justify-center gap-2 w-full py-3.5 px-4 rounded-[6px] bg-[#FF4D00] text-[#0A0A0B] text-[14px] font-semibold tracking-[-0.01em] hover:bg-[#E64500] transition-colors cursor-pointer shrink-0 select-none"
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

      {/* Structured Transfer Rows Container */}
      <div className="flex-1 flex flex-col min-h-0 rounded-[10px] bg-[#111113] border border-[#232327] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
        {/* Table Header */}
        <div className="px-4 py-2.5 border-b border-[#232327] flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.06em] text-[#71717A] shrink-0">
          <span>Active Transfers</span>
          <span className="mono-num text-[11px] text-[#71717A]">
            {transfers.length} {transfers.length === 1 ? 'ITEM' : 'ITEMS'}
          </span>
        </div>

        {/* Transfer Items */}
        <div className="flex-1 overflow-y-auto transfer-scroll divide-y divide-[#232327]">
          {transfers.length === 0 ? (
            <div className="flex items-center justify-center h-full py-12 text-center text-[12px] text-[#71717A] mono-num">
              No transfers yet. Drop files, select, or paste (⌘V).
            </div>
          ) : (
            transfers.map((t) => {
              const isSend = t.direction === 'send';
              const isDone = t.status === 'completed';
              const percent = Math.min(100, Math.max(0, Math.round(t.percentage)));
              const ext = getFileExtension(t.name);
              const transferredBytes = Math.min(t.size, Math.round((percent / 100) * t.size));

              return (
                <div
                  key={t.id}
                  className="px-4 py-3 flex flex-col gap-2 hover:bg-[#18181B]/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Direction Arrow */}
                      <span className="shrink-0">
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

                      {/* File Extension Badge */}
                      <span className="shrink-0 px-1.5 py-0.5 rounded-[4px] bg-[#18181B] border border-[#27272A] text-[10px] font-mono text-[#A1A1AA] tracking-wider uppercase">
                        {ext}
                      </span>

                      {/* Truncated Filename */}
                      <span className="text-[13px] font-medium text-[#F4F4F5] truncate">
                        {t.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Tabular Telemetry: transferred / total size */}
                      <span className="mono-num text-[12px] text-[#A1A1AA] tabular-nums">
                        {isDone
                          ? formatSize(t.size)
                          : `${formatSize(transferredBytes)} / ${formatSize(t.size)}`}
                      </span>

                      {/* Live Speed / Status */}
                      {t.status === 'transferring' ? (
                        <span className="mono-num text-[11px] text-[#E4E4E7] tabular-nums">
                          {t.speedMBs}
                        </span>
                      ) : isDone ? (
                        <span className="mono-num text-[10px] text-[#71717A] tracking-wider uppercase">
                          COMPLETED
                        </span>
                      ) : null}

                      {/* Crisp Save Button for Completed Incoming Files */}
                      {!isSend && isDone && (
                        <button
                          type="button"
                          data-testid="save-btn"
                          onClick={() => handleSaveClick(t)}
                          className="px-2.5 py-1 rounded-[6px] bg-[#18181B] border border-[#2E2E34] hover:border-[#52525B] text-[12px] font-medium text-[#F4F4F5] transition-colors cursor-pointer select-none"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3px Progress Track with #FF4D00 fill */}
                  <div className="w-full h-[3px] bg-[#1C1C20] rounded-full overflow-hidden">
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
