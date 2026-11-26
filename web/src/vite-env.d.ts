/// <reference types="vite/client" />

declare module 'jsqr' {
  export interface QRCode {
    binaryData: number[];
    data: string;
    chunks: any[];
    version: number;
    location: any;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
  ): QRCode | null;
}
