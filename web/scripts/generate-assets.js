import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate favicon.svg (24x24 geometric lightning mark)
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
  <rect width="24" height="24" fill="#0A0A0B" rx="4"/>
  <path d="M13 3 5 13h6l-1 8 8-10h-6z" fill="none" stroke="#FF4D00" stroke-width="1.8" stroke-linejoin="miter"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf-8');
console.log('Generated public/favicon.svg');

// PNG Helper: Create uncompressed/deflated raw RGBA PNG buffer without external canvas deps
function createPng(width, height, getPixelRgba) {
  // getPixelRgba(x, y) returns [r, g, b, a] (0-255)
  // Scanlines start with 0 filter byte
  const rowStride = 1 + width * 4;
  const rawData = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 2. Generate public/apple-touch-icon.png (180x180)
// Matte obsidian background #0A0A0B, border #26262A, lightning stroke in #FF4D00
const appleTouchIconPng = createPng(180, 180, (x, y) => {
  // Border check
  if (x === 0 || x === 179 || y === 0 || y === 179) {
    return [0x26, 0x26, 0x2a, 0xff];
  }

  // Draw scaled geometric lightning bolt:
  // Points roughly in [0..24] space: (13,3)-(5,13)-(11,13)-(10,21)-(18,11)-(12,11)-(13,3)
  // Scale to [0..180]: margin 36px, width 108px
  const nx = (x - 36) / 108 * 24;
  const ny = (y - 36) / 108 * 24;

  // Simple polygon distance approximation or raster fill
  // Let's check if (nx, ny) is inside or near lightning bolt
  const inBolt = isPointInLightning(nx, ny);
  if (inBolt) {
    return [0xff, 0x4d, 0x00, 0xff]; // Signal orange #FF4D00
  }

  return [0x0a, 0x0a, 0x0b, 0xff]; // Background #0A0A0B
});

function isPointInLightning(x, y) {
  // Lightning vertices:
  // V1: (13, 2.5), V2: (5, 13.5), V3: (11.5, 13.5), V4: (9.5, 21.5), V5: (18.5, 10.5), V6: (12, 10.5)
  const poly = [
    [13, 2.5],
    [5, 13.5],
    [11.5, 13.5],
    [9.5, 21.5],
    [18.5, 10.5],
    [12, 10.5],
  ];
  return pointInPolygon(x, y, poly);
}

function pointInPolygon(x, y, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchIconPng);
console.log('Generated public/apple-touch-icon.png (180x180)');

// 3. Generate public/og-image.png (1200x630 Swiss dark typographic preview card)
// Clean minimalist dark typographic composition:
// Top bar line, big central title "FLASHDROP", subtitle "EPHEMERAL • DIRECT P2P FILE TRANSFER",
// signal orange lightning accent and technical badges
const ogImagePng = createPng(1200, 630, (x, y) => {
  // Border hairline
  if (x < 2 || x >= 1198 || y < 2 || y >= 628) {
    return [0x26, 0x26, 0x2a, 0xff];
  }

  // Top header hairline accent
  if (y >= 80 && y <= 82 && x >= 80 && x <= 1120) {
    return [0x26, 0x26, 0x2a, 0xff];
  }

  // Bottom footer hairline accent
  if (y >= 540 && y <= 542 && x >= 80 && x <= 1120) {
    return [0x26, 0x26, 0x2a, 0xff];
  }

  // Signal orange badge bar
  if (y >= 130 && y <= 134 && x >= 80 && x <= 180) {
    return [0xff, 0x4d, 0x00, 0xff];
  }

  // Card background #141416 in center
  if (x >= 80 && x <= 1120 && y >= 160 && y <= 500) {
    // Inner card border
    if (x === 80 || x === 1120 || y === 160 || y === 500) {
      return [0x26, 0x26, 0x2a, 0xff];
    }

    // Inside card: render lightning mark near right edge
    const boltX = (x - 860) / 160 * 24;
    const boltY = (y - 240) / 160 * 24;
    if (boltX >= 0 && boltX <= 24 && boltY >= 0 && boltY <= 24) {
      if (isPointInLightning(boltX, boltY)) {
        return [0xff, 0x4d, 0x00, 0xff];
      }
    }

    // Sub-bars simulating Swiss typographic block rhythm
    // Line 1: Title block
    if (y >= 230 && y <= 270 && x >= 130 && x <= 720) {
      return [0xf4, 0xf4, 0xf5, 0xff];
    }

    // Line 2: Subtitle block
    if (y >= 300 && y <= 320 && x >= 130 && x <= 580) {
      return [0x71, 0x71, 0x7a, 0xff];
    }

    // Line 3: Monospace pill
    if (y >= 360 && y <= 390 && x >= 130 && x <= 420) {
      if (x === 130 || x === 420 || y === 360 || y === 390) {
        return [0x26, 0x26, 0x2a, 0xff];
      }
      return [0x10, 0xb9, 0x81, 0x40]; // Connected tint
    }

    return [0x14, 0x14, 0x16, 0xff];
  }

  return [0x0a, 0x0a, 0x0b, 0xff];
});

fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogImagePng);
console.log('Generated public/og-image.png (1200x630)');
