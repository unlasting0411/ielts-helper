// 把 pdf.js 的字体映射、标准字体和 wasm 解码器复制到 public/pdfjs，随应用一起离线缓存
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');
