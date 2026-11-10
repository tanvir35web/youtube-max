const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create PNG from raw RGBA buffer
function createPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  let scanlineOffset = 0;
  let rgbaOffset = 0;

  for (let y = 0; y < height; y++) {
    scanlines[scanlineOffset++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      scanlines[scanlineOffset++] = rgbaBuffer[rgbaOffset++]; // R
      scanlines[scanlineOffset++] = rgbaBuffer[rgbaOffset++]; // G
      scanlines[scanlineOffset++] = rgbaBuffer[rgbaOffset++]; // B
      scanlines[scanlineOffset++] = rgbaBuffer[rgbaOffset++]; // A
    }
  }

  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// Generate YouTube-style icon (Dark luxury red + white rounded triangle play button)
function generateAppIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size / 2;
  const cornerRadius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      
      // Rounded rect mask
      const dx = Math.max(Math.abs(x - size/2) - (size/2 - cornerRadius), 0);
      const dy = Math.max(Math.abs(y - size/2) - (size/2 - cornerRadius), 0);
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist > cornerRadius) {
        // Outside rounded rect
        buf[idx] = 0; buf[idx+1] = 0; buf[idx+2] = 0; buf[idx+3] = 0;
        continue;
      }

      // Background: Dark YouTube gradient #0F0F0F to #1A1A1A or Red Badge
      // Let's create YouTube Red #FF0000 with subtle gradient
      const grad = (y / size);
      let bgR = Math.round(255 - grad * 35);
      let bgG = Math.round(10 - grad * 10);
      let bgB = Math.round(15 - grad * 15);

      // White Play Triangle in center
      // Triangle vertices:
      // Left: size * 0.38, top: size * 0.32, bottom: size * 0.68
      // Right tip: size * 0.68, y: size * 0.50
      const tx1 = size * 0.40, ty1 = size * 0.34;
      const tx2 = size * 0.40, ty2 = size * 0.66;
      const tx3 = size * 0.68, ty3 = size * 0.50;

      // Point in triangle test
      function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
        return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
      }
      const d1 = sign(x, y, tx1, ty1, tx2, ty2);
      const d2 = sign(x, y, tx2, ty2, tx3, ty3);
      const d3 = sign(x, y, tx3, ty3, tx1, ty1);

      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      const inTriangle = !(hasNeg && hasPos);

      if (inTriangle) {
        buf[idx] = 255;
        buf[idx+1] = 255;
        buf[idx+2] = 255;
        buf[idx+3] = 255;
      } else {
        buf[idx] = bgR;
        buf[idx+1] = bgG;
        buf[idx+2] = bgB;
        buf[idx+3] = 255;
      }
    }
  }

  return createPNG(size, height = size, buf);
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), generateAppIcon(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), generateAppIcon(512));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), generateAppIcon(180));
console.log('Icons generated successfully!');

