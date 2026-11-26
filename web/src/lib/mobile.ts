export class MobileDeviceManager {
  private wakeLockSentinel: any = null;
  private hasActiveTransfer = false;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

  constructor() {
    this.setupBeforeUnload();
  }

  public async acquireWakeLock(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed or not allowed', err);
        return false;
      }
    }
    return false;
  }

  public async releaseWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (err) {
        console.warn('Wake Lock release error', err);
      } finally {
        this.wakeLockSentinel = null;
      }
    }
  }

  public setActiveTransfer(active: boolean): void {
    this.hasActiveTransfer = active;
    if (active) {
      this.acquireWakeLock();
    } else {
      this.releaseWakeLock();
    }
  }

  private setupBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        if (this.hasActiveTransfer) {
          e.preventDefault();
          e.returnValue = 'Transfer in progress. Are you sure you want to leave?';
          return e.returnValue;
        }
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  public cleanup(): void {
    this.releaseWakeLock();
    if (typeof window !== 'undefined' && this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }
}

export const mobileManager = new MobileDeviceManager();
