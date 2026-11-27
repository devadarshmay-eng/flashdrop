import {
  FileMetadata,
  FileEndMessage,
  FileCancelMessage,
  TransferWireMessage,
  TransferProgress,
  TransferChannel,
} from './types';
import { WebRTCDataChannelAdapter } from './channel';

export const CHUNK_SIZE = 16384; // 16 KB binary chunks
export const BUFFER_LOW_THRESHOLD = 65536; // 64 KB
export const BUFFER_HIGH_THRESHOLD = 262144; // 256 KB

export interface FileTransferSenderOptions {
  channel?: TransferChannel | RTCDataChannel;
  dataChannel?: RTCDataChannel; // Backward-compatible alias
  onProgress?: (progress: TransferProgress) => void;
  onComplete?: (progress: TransferProgress) => void;
  onError?: (id: string, error: Error) => void;
}

export interface FileTransferReceiverOptions {
  channel?: TransferChannel | RTCDataChannel;
  dataChannel?: RTCDataChannel; // Backward-compatible alias
  onProgress?: (progress: TransferProgress) => void;
  onComplete?: (progress: TransferProgress) => void;
  onError?: (id: string, error: Error) => void;
  autoDownload?: boolean;
}

export class FileTransferSender {
  private channel: TransferChannel;
  private onProgressCb?: (progress: TransferProgress) => void;
  private onCompleteCb?: (progress: TransferProgress) => void;
  private onErrorCb?: (id: string, error: Error) => void;
  private activeTransfers = new Map<string, { cancelled: boolean }>();

  constructor(options: FileTransferSenderOptions) {
    const rawChannel = options.channel || options.dataChannel;
    if (!rawChannel) {
      throw new Error('FileTransferSender requires a channel or dataChannel');
    }

    if ('send' in rawChannel && 'waitForDrain' in rawChannel) {
      this.channel = rawChannel as TransferChannel;
    } else {
      this.channel = new WebRTCDataChannelAdapter(rawChannel as RTCDataChannel);
    }

    this.onProgressCb = options.onProgress;
    this.onCompleteCb = options.onComplete;
    this.onErrorCb = options.onError;
  }

  public getChannelType(): 'webrtc' | 'relay' {
    return this.channel.channelType;
  }

  public async sendFile(file: File | Blob, customName?: string): Promise<string> {
    const id = crypto.randomUUID();
    const name = customName || (file instanceof File ? file.name : 'download');
    const size = file.size;
    const mimeType = file.type || 'application/octet-stream';
    const totalChunks = Math.ceil(size / CHUNK_SIZE) || 1;

    this.activeTransfers.set(id, { cancelled: false });

    const metadata: FileMetadata = {
      type: 'FILE_META',
      id,
      name,
      size,
      mimeType,
      totalChunks,
      chunkSize: CHUNK_SIZE,
    };

    // Send metadata header
    this.channel.send(JSON.stringify(metadata));

    let transferredBytes = 0;
    const startTime = performance.now();
    let lastProgressUpdate = startTime;
    let bytesSinceLastUpdate = 0;
    let speedBps = 0;

    const progress: TransferProgress = {
      id,
      name,
      size,
      mimeType,
      transferredBytes: 0,
      percentage: 0,
      speedBps: 0,
      speedMBs: '0.0 MB/s',
      status: 'transferring',
      direction: 'send',
    };

    try {
      for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
        const transferState = this.activeTransfers.get(id);
        if (!transferState || transferState.cancelled) {
          const cancelMsg: FileCancelMessage = { type: 'FILE_CANCEL', id, reason: 'Sender cancelled' };
          this.channel.send(JSON.stringify(cancelMsg));
          progress.status = 'cancelled';
          if (this.onProgressCb) this.onProgressCb({ ...progress });
          return id;
        }

        // Backpressure / Sliding Window flow control:
        await this.channel.waitForDrain();

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const arrayBuffer = await slice.arrayBuffer();

        this.channel.send(arrayBuffer);

        transferredBytes += arrayBuffer.byteLength;
        bytesSinceLastUpdate += arrayBuffer.byteLength;

        const now = performance.now();
        const timeDiff = now - lastProgressUpdate;

        // Update progress every 100ms or on completion
        if (timeDiff >= 100 || transferredBytes === size) {
          speedBps = (bytesSinceLastUpdate / (timeDiff || 1)) * 1000;
          const speedMBs = `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`;

          progress.transferredBytes = transferredBytes;
          progress.percentage = size > 0 ? Math.min(100, Math.round((transferredBytes / size) * 100)) : 100;
          progress.speedBps = speedBps;
          progress.speedMBs = speedMBs;

          if (this.onProgressCb) {
            this.onProgressCb({ ...progress });
          }

          lastProgressUpdate = now;
          bytesSinceLastUpdate = 0;
        }
      }

      // Send trailer
      const trailer: FileEndMessage = {
        type: 'FILE_END',
        id,
      };
      this.channel.send(JSON.stringify(trailer));

      progress.status = 'completed';
      progress.percentage = 100;
      progress.transferredBytes = size;
      progress.speedMBs = '0.0 MB/s';

      if (this.onCompleteCb) {
        this.onCompleteCb(progress);
      }
    } catch (err: any) {
      progress.status = 'failed';
      progress.error = err.message;
      if (this.onErrorCb) {
        this.onErrorCb(id, err);
      }
      throw err;
    } finally {
      this.activeTransfers.delete(id);
    }

    return id;
  }

  public cancel(id: string): void {
    const transfer = this.activeTransfers.get(id);
    if (transfer) {
      transfer.cancelled = true;
    }
  }
}

export class FileTransferReceiver {
  private channel: TransferChannel;
  private onProgressCb?: (progress: TransferProgress) => void;
  private onCompleteCb?: (progress: TransferProgress) => void;
  private onErrorCb?: (id: string, error: Error) => void;
  private autoDownload: boolean;

  private activeReceives = new Map<
    string,
    {
      meta: FileMetadata;
      chunks: ArrayBuffer[];
      receivedBytes: number;
      startTime: number;
      lastProgressTime: number;
      bytesSinceLastUpdate: number;
    }
  >();

  private activeFileId: string | null = null;
  private activeObjectUrls: string[] = [];

  constructor(options: FileTransferReceiverOptions) {
    const rawChannel = options.channel || options.dataChannel;
    if (!rawChannel) {
      throw new Error('FileTransferReceiver requires a channel or dataChannel');
    }

    if ('send' in rawChannel && 'waitForDrain' in rawChannel) {
      this.channel = rawChannel as TransferChannel;
    } else {
      this.channel = new WebRTCDataChannelAdapter(rawChannel as RTCDataChannel);
    }

    this.onProgressCb = options.onProgress;
    this.onCompleteCb = options.onComplete;
    this.onErrorCb = options.onError;
    this.autoDownload = options.autoDownload ?? true;

    this.channel.onMessage = (data: string | ArrayBuffer) => {
      this.handleIncomingData(data);
    };
  }

  public getChannelType(): 'webrtc' | 'relay' {
    return this.channel.channelType;
  }

  public setAutoDownload(auto: boolean): void {
    this.autoDownload = auto;
  }

  public handleIncomingData(data: ArrayBuffer | string): void {
    try {
      if (typeof data === 'string') {
        const msg: TransferWireMessage = JSON.parse(data);
        if (msg.type === 'FILE_META') {
          this.handleFileMeta(msg);
        } else if (msg.type === 'FILE_END') {
          this.handleFileEnd(msg);
        } else if (msg.type === 'FILE_CANCEL') {
          this.handleFileCancel(msg);
        }
        return;
      }

      // Binary chunk
      if (data instanceof ArrayBuffer && this.activeFileId) {
        this.handleChunk(this.activeFileId, data);
      }
    } catch (err: any) {
      if (this.onErrorCb && this.activeFileId) {
        this.onErrorCb(this.activeFileId, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private handleFileMeta(meta: FileMetadata): void {
    this.activeFileId = meta.id;
    const now = performance.now();
    this.activeReceives.set(meta.id, {
      meta,
      chunks: [],
      receivedBytes: 0,
      startTime: now,
      lastProgressTime: now,
      bytesSinceLastUpdate: 0,
    });

    if (this.onProgressCb) {
      this.onProgressCb({
        id: meta.id,
        name: meta.name,
        size: meta.size,
        mimeType: meta.mimeType,
        transferredBytes: 0,
        percentage: 0,
        speedBps: 0,
        speedMBs: '0.0 MB/s',
        status: 'transferring',
        direction: 'receive',
      });
    }
  }

  private handleChunk(id: string, chunk: ArrayBuffer): void {
    const item = this.activeReceives.get(id);
    if (!item) return;

    item.chunks.push(chunk);
    item.receivedBytes += chunk.byteLength;
    item.bytesSinceLastUpdate += chunk.byteLength;

    const now = performance.now();
    const timeDiff = now - item.lastProgressTime;

    if (timeDiff >= 100 || item.receivedBytes === item.meta.size) {
      const speedBps = (item.bytesSinceLastUpdate / (timeDiff || 1)) * 1000;
      const speedMBs = `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s`;
      const percentage = item.meta.size > 0 
        ? Math.min(100, Math.round((item.receivedBytes / item.meta.size) * 100))
        : 100;

      if (this.onProgressCb) {
        this.onProgressCb({
          id,
          name: item.meta.name,
          size: item.meta.size,
          mimeType: item.meta.mimeType,
          transferredBytes: item.receivedBytes,
          percentage,
          speedBps,
          speedMBs,
          status: 'transferring',
          direction: 'receive',
        });
      }

      item.lastProgressTime = now;
      item.bytesSinceLastUpdate = 0;
    }
  }

  private handleFileEnd(msg: FileEndMessage): void {
    const item = this.activeReceives.get(msg.id);
    if (!item) return;

    const blob = new Blob(item.chunks, { type: item.meta.mimeType });
    const objectUrl = URL.createObjectURL(blob);
    this.activeObjectUrls.push(objectUrl);

    let thumbnailUrl: string | undefined = undefined;
    if (item.meta.mimeType.startsWith('image/')) {
      thumbnailUrl = objectUrl;
    }

    const progress: TransferProgress = {
      id: item.meta.id,
      name: item.meta.name,
      size: item.meta.size,
      mimeType: item.meta.mimeType,
      transferredBytes: item.receivedBytes,
      percentage: 100,
      speedBps: 0,
      speedMBs: '0.0 MB/s',
      status: 'completed',
      direction: 'receive',
      blob,
      objectUrl,
      thumbnailUrl,
    };

    if (this.autoDownload) {
      triggerDownload(objectUrl, item.meta.name);
    }

    if (this.onCompleteCb) {
      this.onCompleteCb(progress);
    }

    this.activeReceives.delete(msg.id);
    if (this.activeFileId === msg.id) {
      this.activeFileId = null;
    }
  }

  private handleFileCancel(msg: FileCancelMessage): void {
    const item = this.activeReceives.get(msg.id);
    if (!item) return;

    if (this.onProgressCb) {
      this.onProgressCb({
        id: item.meta.id,
        name: item.meta.name,
        size: item.meta.size,
        mimeType: item.meta.mimeType,
        transferredBytes: item.receivedBytes,
        percentage: 0,
        speedBps: 0,
        speedMBs: '0.0 MB/s',
        status: 'cancelled',
        direction: 'receive',
        error: msg.reason || 'Cancelled by peer',
      });
    }

    this.activeReceives.delete(msg.id);
    if (this.activeFileId === msg.id) {
      this.activeFileId = null;
    }
  }

  public dissolveSession(): void {
    for (const url of this.activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.activeObjectUrls = [];
    this.activeReceives.clear();
    this.activeFileId = null;
  }
}

export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
