import type { FileMeta, TaskRef } from '../types';
import { isAudio, isPdf } from './tagger';

export const SKILL_LABEL: Record<string, string> = {
  listening: '听力',
  reading: '阅读',
  writing: '写作',
  speaking: '口语',
  all: '全科',
  vocab: '单词',
  review: '复盘',
};

export type MatchResult = {
  pdf?: FileMeta;
  page?: number;          // 整本书 PDF 时由书签决定的跳转页
  audios: FileMeta[];     // 听力任务的音频（按 Section 排序）
  missing: string;        // 如“剑19 Test 1 阅读”
};

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

// 测试卷优先于解析等其他类别
function rank(f: FileMeta): number {
  return f.category === 'test' ? 0 : f.category === 'other' ? 1 : 2;
}

export function matchTask(ref: TaskRef, files: FileMeta[]): MatchResult {
  const missing = `剑${ref.book} Test ${ref.test} ${SKILL_LABEL[ref.skill] ?? ref.skill}`;
  const pdfs = files
    .filter((f) => isPdf(f.name, f.mime) && f.category !== 'answer' && f.book === ref.book)
    .sort((a, b) => rank(a) - rank(b));

  let pdf = pdfs.find((f) => f.test === ref.test && f.skill === ref.skill);
  pdf ??= pdfs.find((f) => f.test === ref.test && f.skill === 'all');
  let page: number | undefined;
  if (!pdf) {
    const whole = pdfs.find((f) => f.test == null);
    if (whole) {
      pdf = whole;
      const want = normalize(`T${ref.test}${SKILL_LABEL[ref.skill] ?? ''}`);
      page = whole.bookmarks.find((b) => normalize(b.label).startsWith(want))?.page;
    }
  }

  const audios =
    ref.skill === 'listening'
      ? files
          .filter((f) => f.category === 'audio' && isAudio(f.name, f.mime) && f.book === ref.book && f.test === ref.test)
          .sort((a, b) => (a.section ?? 99) - (b.section ?? 99) || a.name.localeCompare(b.name))
      : [];

  return { pdf, page, audios, missing };
}

export function refLabel(f: Pick<FileMeta, 'book' | 'test' | 'skill' | 'section'>): string {
  const parts: string[] = [];
  if (f.book != null) parts.push(`剑${f.book}`);
  if (f.test != null) parts.push(`Test ${f.test}`);
  if (f.skill) parts.push(SKILL_LABEL[f.skill]);
  if (f.section != null) parts.push(`S${f.section}`);
  return parts.join(' ');
}
