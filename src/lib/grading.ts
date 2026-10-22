// 答题卡判分（纯函数）
//
// 答案写法约定（录入答案时用）：
// - 多个可接受写法用 / 分隔：`15/fifteen`
// - 括号内为可省略的词：`(the) river` 同时接受 `the river` 和 `river`
// - 两题顺序不限（如 Choose TWO）：两题都写成 `B&D`
// - 判断题 T/F/NG、Y/N/NG 的缩写和全称都算对

export const QUESTION_COUNT = 40;

const WORD_ALIASES: Record<string, string> = {
  t: 'true',
  f: 'false',
  ng: 'not given',
  notgiven: 'not given',
  y: 'yes',
  n: 'no',
};

export function normalize(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[，。；：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, '');
  return WORD_ALIASES[base.replace(/\s+/g, '')] ?? base;
}

// 展开括号里的可省略部分
function expandOptional(alt: string): string[] {
  const m = alt.match(/\(([^()]*)\)/);
  if (!m) return [alt];
  const before = alt.slice(0, m.index);
  const after = alt.slice(m.index! + m[0].length);
  return [...expandOptional(before + m[1] + after), ...expandOptional(before + after)];
}

export function acceptedAnswers(key: string): string[] {
  return key
    .split(/\s*\/\s*|\s*\|\s*|\s+or\s+/i)
    .flatMap(expandOptional)
    .map(normalize)
    .filter(Boolean);
}

export function isCorrect(answer: string, key: string): boolean {
  const a = normalize(answer);
  if (!a) return false;
  return acceptedAnswers(key).includes(a);
}

export type GradeResult = {
  correct: (boolean | null)[]; // null = 该题没有录入答案
  raw: number;
  total: number; // 有答案的题数
};

export function grade(answers: string[], key: string[]): GradeResult {
  const n = Math.max(QUESTION_COUNT, key.length);
  const correct: (boolean | null)[] = Array.from({ length: n }, () => null);
  for (let i = 0; i < n; i++) {
    const k = (key[i] ?? '').trim();
    if (!k) continue;
    if (k.includes('&')) {
      // 顺序不限的一组：连续几题写着同一个 `B&D`
      let j = i;
      while (j + 1 < n && (key[j + 1] ?? '').trim() === k) j++;
      const pool = k.split('&').map((x) => x.trim()).filter(Boolean);
      const remaining = [...pool];
      for (let q = i; q <= j; q++) {
        const idx = remaining.findIndex((opt) => isCorrect(answers[q] ?? '', opt));
        correct[q] = idx >= 0;
        if (idx >= 0) remaining.splice(idx, 1);
      }
      i = j;
      continue;
    }
    correct[i] = isCorrect(answers[i] ?? '', k);
  }
  return {
    correct,
    raw: correct.filter((c) => c === true).length,
    total: correct.filter((c) => c !== null).length,
  };
}

// 解析粘贴的一整段答案。支持：
//   每行一个答案（按顺序）
//   `1 A` / `1. A` / `1) A` / `1、A` / `Q1: A`，一行里也可以连着写 `1.A 2.B 3.C`
//   `21-22 B, D` 或 `21&22 B D`（顺序不限的一组）
export function parseKeyText(text: string): string[] {
  const out: string[] = Array.from({ length: QUESTION_COUNT }, () => '');
  let next = 0;
  const lines = text
    .split(/\r?\n/)
    .flatMap((l) => l.split(/\s+(?=(?:q\s*)?\d{1,2}\s*(?:[.、)）:：]|[-–~&]\s*\d{1,2}\b))/i))
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const range = line.match(/^(?:q\s*)?(\d{1,2})\s*[-–~&]\s*(\d{1,2})\s*[.、)）:：]?\s*(.+)$/i);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const opts = range[3].split(/[\s,，、&]+/).filter(Boolean);
      if (b > a && b - a + 1 === opts.length && b <= QUESTION_COUNT) {
        const group = opts.join('&');
        for (let q = a; q <= b; q++) out[q - 1] = group;
        next = b;
        continue;
      }
    }
    const numbered = line.match(/^(?:q\s*)?(\d{1,2})\s*[.、)）:：]?\s+(.+)$|^(?:q\s*)?(\d{1,2})\s*[.、)）:：]\s*(.+)$/i);
    if (numbered) {
      const q = Number(numbered[1] ?? numbered[3]);
      const ans = (numbered[2] ?? numbered[4]).trim();
      if (q >= 1 && q <= QUESTION_COUNT) {
        out[q - 1] = ans;
        next = q;
        continue;
      }
    }
    if (next < QUESTION_COUNT) out[next++] = line;
  }
  return out;
}

export function keyId(book: number, test: number, skill: string): string {
  return `${book}-${test}-${skill}`;
}

// 错题出处，如“剑15 T1 S2 Q14”（听力带 Section，阅读不带）
export function questionSource(book: number, test: number, skill: string, q: number): string {
  const sec = skill === 'listening' ? ` S${Math.ceil(q / 10)}` : '';
  return `剑${book} T${test}${sec} Q${q}`;
}
