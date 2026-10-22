import { LISTENING_BANDS, READING_BANDS, TARGET_SUM, overallBand } from '../data/constants';
import type { Score } from '../types';

export function rawToBand(raw: number, table: [number, number][]): number {
  for (const [min, band] of table) if (raw >= min) return band;
  return 0;
}

export type ScoreSummary = {
  listening?: number;
  reading?: number;
  writing?: number;
  speaking?: number;
  sum: number;          // 已填写科目的分数和
  complete: boolean;    // 四科都填写
  overall?: number;     // 仅四科齐全时
  gap?: number;         // 离 29 还差多少（四科齐全时；<= 0 表示已达标）
};

export function summarize(s: Pick<Score, 'listeningRaw' | 'readingRaw' | 'writing' | 'speaking'>): ScoreSummary {
  const listening = s.listeningRaw != null ? rawToBand(s.listeningRaw, LISTENING_BANDS) : undefined;
  const reading = s.readingRaw != null ? rawToBand(s.readingRaw, READING_BANDS) : undefined;
  const { writing, speaking } = s;
  const parts = [listening, reading, writing, speaking];
  const sum = parts.reduce<number>((a, b) => a + (b ?? 0), 0);
  const complete = parts.every((p) => p != null);
  return {
    listening, reading, writing, speaking, sum, complete,
    overall: complete ? overallBand(listening!, reading!, writing!, speaking!) : undefined,
    gap: complete ? Math.round((TARGET_SUM - sum) * 10) / 10 : undefined,
  };
}

export function fmtBand(n: number | undefined): string {
  return n == null ? '—' : n.toFixed(1);
}
