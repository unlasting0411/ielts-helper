// 生成 PWA 图标 PNG（纯 Node，无依赖）：蓝底 + 白色对勾
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 100;
  const bg = [36, 87, 197];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s, py = (y + 0.5) / s;
      // 对勾：两段粗线，留在 maskable 安全区内
      const d = Math.min(distToSeg(px, py, 30, 52, 44, 66), distToSeg(px, py, 44, 66, 71, 36));
      const a = Math.max(0, Math.min(1, (6 - d) * s)); // 线宽 12，抗锯齿
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round(bg[0] + (255 - bg[0]) * a);
      raw[i + 1] = Math.round(bg[1] + (255 - bg[1]) * a);
      raw[i + 2] = Math.round(bg[2] + (255 - bg[2]) * a);
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(join(out, `icon-${size}.png`), icon(size));
writeFileSync(
  join(out, 'icon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#2457c5"/><path d="M30 52l14 14 27-30" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>\n',
);
console.log('icons written');
