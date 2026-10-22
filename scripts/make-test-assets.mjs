// 生成测试用的空白 PDF 和测试音频（不含任何真题内容），输出到 test-assets/（已在 .gitignore 中）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-assets');
mkdirSync(out, { recursive: true });

function pdf(pages, title) {
  const objs = [];
  const kids = [];
  const n = pages;
  // 1 catalog, 2 pages, 3 font, then per page: page obj + content obj
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < n; i++) {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const text = `BT /F1 28 Tf 72 720 Td (${title}) Tj ET BT /F1 48 Tf 72 600 Td (Page ${i + 1} / ${n}) Tj ET`;
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function wav(seconds, freq) {
  const rate = 8000;
  const len = rate * seconds;
  const buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    const on = t % 1 < 0.15; // 每秒一声短音，方便听出位置
    const v = on ? Math.sin(2 * Math.PI * freq * t) * 0.3 : 0;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

writeFileSync(join(out, '剑15 Test 1 听力.pdf'), pdf(4, 'Blank test: C15 T1 Listening'));
writeFileSync(join(out, '剑15 Test 1 阅读.pdf'), pdf(6, 'Blank test: C15 T1 Reading'));
writeFileSync(join(out, '剑15 解析.pdf'), pdf(3, 'Blank test: C15 answers'));
writeFileSync(join(out, '剑19.pdf'), pdf(20, 'Blank test: C19 whole book'));
writeFileSync(join(out, 'my notes.pdf'), pdf(2, 'Blank test: untagged'));
writeFileSync(join(out, '剑15 Test 1 Section 1.wav'), wav(40, 660));
writeFileSync(join(out, '剑15 Test 1 Section 2.wav'), wav(40, 440));
console.log('test assets written to test-assets/');

// 可选：node scripts/make-test-assets.mjs --big 生成 40 MB 的 PDF，用来测试大文件分段读取
if (process.argv.includes('--big')) {
  const small = pdf(3, 'Blank test: big file C16 T1 Reading').toString('latin1');
  // 在文件头后插入一个未被引用的大注释块，再重新计算 xref 偏移
  const pad = '%' + 'x'.repeat(1023) + '\n';
  const padding = pad.repeat(40 * 1024);
  const head = '%PDF-1.4\n';
  const rest = small.slice(head.length, small.indexOf('xref\n'));
  const body = head + padding + rest;
  const shift = padding.length;
  const xrefPart = small.slice(small.indexOf('xref\n'));
  const fixed = xrefPart
    .replace(/^(\d{10}) 00000 n $/gm, (_, o) => `${String(Number(o) + shift).padStart(10, '0')} 00000 n `)
    .replace(/startxref\n(\d+)/, (_, o) => `startxref\n${Number(o) + shift}`);
  writeFileSync(join(out, '剑16 Test 1 阅读 big.pdf'), Buffer.from(body + fixed, 'latin1'));
  console.log('big pdf written');
}
