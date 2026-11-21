// 生成占位应用图标：深蓝底 + 白色打开的书。
// 使用 Node 内置 zlib 手写 PNG/ICO，不引入图像依赖。
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(import.meta.dirname, "..", "src-tauri", "icons");
fs.mkdirSync(OUT, { recursive: true });

const BASE = 1024;

function inBook(x, y) {
  const t = (y - 240) / 560; // 0..1 down the page
  if (t < 0 || t > 1) return false;
  const spread = 300 - t * 40;
  const left = 512 - 34 - spread * (0.62 + t * 0.08);
  const right = 512 + 34 + spread * (0.62 + t * 0.08);
  if (y < 280 || y > 760) return false;
  return (x > left && x < 478) || (x > 546 && x < right);
}

function inLine(x, y, offset) {
  const t = (y - 360 - offset) / 22;
  if (t < 0 || t > 1) return false;
  if (y < 380 || y > 690) return false;
  const spread = 300 - ((y - 240) / 560) * 40;
  const left = 512 - 34 - spread * (0.62 + ((y - 240) / 560) * 0.08);
  const right = 512 + 34 + spread * (0.62 + ((y - 240) / 560) * 0.08);
  const inset = 40;
  return (x > left + inset && x < 478 - inset) || (x > 546 + inset && x < right - inset);
}

function sample(x, y) {
  const sx = x / BASE;
  const sy = y / BASE;
  // 圆角方块底
  const r = 100 / BASE;
  const dx = Math.max(Math.abs(sx - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(sy - 0.5) - (0.5 - r), 0);
  const outside = Math.hypot(dx, dy) > r;
  if (outside) return [0, 0, 0, 0];
  let color = [36, 78, 141, 255];
  if (inBook(x, y)) color = [255, 255, 255, 255];
  if (inBook(x, y) && (inLine(x, y, 0) || inLine(x, y, 84) || inLine(x, y, 168) || inLine(x, y, 252))) {
    color = [176, 200, 230, 255];
  }
  return color;
}

function render(size) {
  const scale = BASE / size;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const startX = Math.floor(x * scale);
      const startY = Math.floor(y * scale);
      const endX = Math.max(startX + 1, Math.floor((x + 1) * scale));
      const endY = Math.max(startY + 1, Math.floor((y + 1) * scale));
      for (let sy = startY; sy < Math.min(endY, BASE); sy += 4) {
        for (let sx = startX; sx < Math.min(endX, BASE); sx += 4) {
          const [cr, cg, cb, ca] = sample(sx, sy);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca; n++;
        }
      }
      const idx = (y * size + x) * 4;
      data[idx] = a ? Math.round(r / a) : 0;
      data[idx + 1] = a ? Math.round(g / a) : 0;
      data[idx + 2] = a ? Math.round(b / a) : 0;
      data[idx + 3] = Math.round(a / n);
    }
  }
  return data;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const payload = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([len, payload, crc]);
}

function png(size) {
  const raw = render(size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    scanlines[y * (size * 4 + 1)] = 0;
    raw.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [size, name] of [
  [32, "32x32.png"],
  [128, "128x128.png"],
  [256, "128x128@2x.png"],
]) {
  fs.writeFileSync(path.join(OUT, name), png(size));
}

const icoPng = png(256);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0;
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(icoPng.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(OUT, "icon.ico"), Buffer.concat([header, entry, icoPng]));
console.log("icons written to", OUT);