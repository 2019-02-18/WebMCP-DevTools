import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

function createPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA

  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);

  const bg1 = [0x25, 0x63, 0xEB];
  const bg2 = [0x1D, 0x4E, 0xD8];
  const cornerR = size * 0.2;

  // Multi-sample anti-aliasing (4x)
  const samples = 4;
  const offsets = [];
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      offsets.push([(sx + 0.5) / samples, (sy + 0.5) / samples]);
    }
  }

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      let bgCount = 0;
      let fgCount = 0;
      let transCount = 0;

      for (const [ox, oy] of offsets) {
        const sx = x + ox;
        const sy = y + oy;

        if (!inRoundedRect(sx, sy, size, cornerR)) {
          transCount++;
        } else if (isSymbolPixel(sx, sy, size)) {
          fgCount++;
        } else {
          bgCount++;
        }
      }

      const total = samples * samples;
      const px = y * rowLen + 1 + x * 4;
      const t = y / size;
      const bgR = Math.round(bg1[0] + (bg2[0] - bg1[0]) * t);
      const bgG = Math.round(bg1[1] + (bg2[1] - bg1[1]) * t);
      const bgB = Math.round(bg1[2] + (bg2[2] - bg1[2]) * t);

      if (transCount === total) {
        raw[px] = 0; raw[px + 1] = 0; raw[px + 2] = 0; raw[px + 3] = 0;
      } else {
        const alpha = Math.round(((bgCount + fgCount) / total) * 255);
        const fgRatio = fgCount / Math.max(1, fgCount + bgCount);
        raw[px]     = Math.round(255 * fgRatio + bgR * (1 - fgRatio));
        raw[px + 1] = Math.round(255 * fgRatio + bgG * (1 - fgRatio));
        raw[px + 2] = Math.round(255 * fgRatio + bgB * (1 - fgRatio));
        raw[px + 3] = alpha;
      }
    }
  }

  const compressed = deflateSync(raw);
  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function inRoundedRect(x, y, size, r) {
  if (x < r && y < r) return dist(x, y, r, r) <= r;
  if (x > size - r && y < r) return dist(x, y, size - r, r) <= r;
  if (x < r && y > size - r) return dist(x, y, r, size - r) <= r;
  if (x > size - r && y > size - r) return dist(x, y, size - r, size - r) <= r;
  return x >= 0 && x <= size && y >= 0 && y <= size;
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function isSymbolPixel(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const thick = Math.max(1.2, s * 0.065);

  // Left angle bracket "<"
  {
    const tipX = s * 0.18;
    const tipY = cy;
    const topX = s * 0.38;
    const topY = s * 0.26;
    const botX = s * 0.38;
    const botY = s * 0.74;

    if (distToSegment(x, y, tipX, tipY, topX, topY) <= thick) return true;
    if (distToSegment(x, y, tipX, tipY, botX, botY) <= thick) return true;
  }

  // Right angle bracket ">"
  {
    const tipX = s * 0.82;
    const tipY = cy;
    const topX = s * 0.62;
    const topY = s * 0.26;
    const botX = s * 0.62;
    const botY = s * 0.74;

    if (distToSegment(x, y, tipX, tipY, topX, topY) <= thick) return true;
    if (distToSegment(x, y, tipX, tipY, botX, botY) <= thick) return true;
  }

  // Center slash "/"
  {
    const slashTop = [s * 0.56, s * 0.24];
    const slashBot = [s * 0.44, s * 0.76];
    if (distToSegment(x, y, slashTop[0], slashTop[1], slashBot[0], slashBot[1]) <= thick * 0.85) return true;
  }

  return false;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

for (const size of [16, 32, 48, 128]) {
  const png = createPNG(size);
  writeFileSync(`public/icons/icon-${size}.png`, png);
  console.log(`Generated icon-${size}.png (${png.length} bytes)`);
}
