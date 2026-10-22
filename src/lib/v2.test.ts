import { describe, expect, it } from 'vitest';
import type { Score } from '../types';
import { DEFAULT_TARGETS, checkpoint14, currentBands, diagnose, gaps, suggestSpare, writingOrSpeaking } from './adaptive';
import { acceptedAnswers, grade, isCorrect, parseKeyText, questionSource } from './grading';
import { displayDay } from './plan';
import { countWords, reviewRequest } from './writing';

describe('判分', () => {
  it('normalizes case, spaces, punctuation and TFNG abbreviations', () => {
    expect(isCorrect(' Library. ', 'library')).toBe(true);
    expect(isCorrect('NG', 'NOT GIVEN')).toBe(true);
    expect(isCorrect('not given', 'NG')).toBe(true);
    expect(isCorrect('T', 'TRUE')).toBe(true);
    expect(isCorrect('Y', 'YES')).toBe(true);
    expect(isCorrect('c', 'C')).toBe(true);
    expect(isCorrect('', 'A')).toBe(false);
    expect(isCorrect('librarys', 'library')).toBe(false);
  });
  it('alternatives and optional words', () => {
    expect(acceptedAnswers('(the) river bank')).toEqual(['the river bank', 'river bank']);
    expect(isCorrect('fifteen', '15/fifteen')).toBe(true);
    expect(isCorrect('river bank', '(the) river bank')).toBe(true);
    expect(isCorrect('bank', '(the) river bank')).toBe(false);
  });
  it('either-order groups', () => {
    const key = ['B&D', 'B&D', 'A'];
    expect(grade(['D', 'B', 'A'], key).correct.slice(0, 3)).toEqual([true, true, true]);
    expect(grade(['B', 'B', 'A'], key).correct.slice(0, 3)).toEqual([true, false, true]);
  });
  it('counts only questions with keys', () => {
    const r = grade(['A', 'x'], ['A', 'B']);
    expect(r.raw).toBe(1);
    expect(r.total).toBe(2);
    expect(r.correct[5]).toBeNull();
  });
});

describe('解析粘贴的答案', () => {
  it('numbered lines, inline lists, unnumbered lines, ranges', () => {
    const k = parseKeyText('1. library\n2) TRUE\n3、C 4.D 5.NOT GIVEN\n21-22 B, D\n23 (the) river');
    expect(k.slice(0, 5)).toEqual(['library', 'TRUE', 'C', 'D', 'NOT GIVEN']);
    expect(k[20]).toBe('B&D');
    expect(k[21]).toBe('B&D');
    expect(k[22]).toBe('(the) river');
    const plain = parseKeyText('A\nB\n15/fifteen');
    expect(plain.slice(0, 3)).toEqual(['A', 'B', '15/fifteen']);
    expect(plain).toHaveLength(40);
  });
  it('builds sources', () => {
    expect(questionSource(15, 2, 'listening', 14)).toBe('剑15 T2 S2 Q14');
    expect(questionSource(16, 1, 'reading', 27)).toBe('剑16 T1 Q27');
  });
});

describe('写作', () => {
  it('counts English words', () => {
    expect(countWords("It's a well-known fact that 25 people agree.")).toBe(8);
    expect(countWords('')).toBe(0);
  });
  it('review request includes prompt, essay and word count', () => {
    const t = reviewRequest({ task: 'T2', prompt: 'Some people think...', text: 'I agree.', label: '剑15 Test 1 Task 2' });
    expect(t).toContain('Task Response');
    expect(t).toContain('（2 词）');
    expect(t).toContain('剑15 Test 1 Task 2');
    expect(t).toContain('字数不足');
  });
});

const sc = (p: Partial<Score>): Score => ({ id: Math.random().toString(), day: 1, label: '', createdAt: 0, ...p });

describe('按分数调整', () => {
  it('current bands average the latest two', () => {
    const cur = currentBands([sc({ day: 1, writing: 5.5 }), sc({ day: 5, writing: 6 }), sc({ day: 8, writing: 6.5, listeningRaw: 35 })]);
    expect(cur.writing).toBe(6.25);
    expect(cur.listening).toBe(8);
  });
  it('gaps sorted desc', () => {
    const g = gaps(DEFAULT_TARGETS, { listening: 7, reading: 8, writing: 5, speaking: 6 });
    expect(g.map((x) => x.skill)).toEqual(['writing', 'listening', 'speaking', 'reading']);
  });
  it('3h allocation favours the weaker of writing/speaking', () => {
    const cur = { writing: 5.5, speaking: 6.5 };
    const days = [1, 2, 3, 4, 5, 6].map((d) => writingOrSpeaking(d, cur, DEFAULT_TARGETS, true));
    expect(days).toEqual(['writing', 'writing', 'speaking', 'writing', 'writing', 'speaking']);
    expect(writingOrSpeaking(2, cur, DEFAULT_TARGETS, false)).toBe('speaking');
    expect(writingOrSpeaking(2, { writing: 6.5, speaking: 6.5 }, DEFAULT_TARGETS, true)).toBe('speaking');
    expect(writingOrSpeaking(2, { writing: 6, speaking: 6.5 }, DEFAULT_TARGETS, true)).toBe('writing');
    const d4 = displayDay(4, 3, (d) => writingOrSpeaking(d, cur, DEFAULT_TARGETS, true))!;
    expect(d4.tasks.map((t) => t.key)).toEqual(['L', 'R', 'W', 'V']);
  });
  it('day 14 checkpoint', () => {
    expect(checkpoint14([sc({ day: 14, listeningRaw: 31, readingRaw: 28 })]).level).toBe('danger');
    expect(checkpoint14([sc({ day: 14, listeningRaw: 31, readingRaw: 30 })]).level).toBe('ok');
    expect(checkpoint14([sc({ day: 14, listeningRaw: 31 })]).level).toBe('pending');
    expect(checkpoint14([sc({ day: 13, readingRaw: 33 }), sc({ day: 14, listeningRaw: 32 })]).level).toBe('ok');
  });
  it('diagnose day 1', () => {
    const d = diagnose([sc({ day: 1, listeningRaw: 35, readingRaw: 33, writing: 6.5, speaking: 7 })], DEFAULT_TARGETS);
    expect(d.level).toBe('ok');
    const bad = diagnose([sc({ day: 1, listeningRaw: 23, readingRaw: 23, writing: 5.5, speaking: 5.5 })], DEFAULT_TARGETS);
    expect(bad.level).toBe('danger');
    expect(diagnose([sc({ day: 1, listeningRaw: 23 })], DEFAULT_TARGETS).level).toBe('pending');
  });
  it('spare suggestion skips submitted attempts', () => {
    expect(suggestSpare('listening', [])).toMatchObject({ book: 15, test: 4 });
    expect(suggestSpare('listening', [{ id: 'a', book: 15, test: 4, skill: 'listening', answers: [], submittedAt: 1, createdAt: 0 }])).toMatchObject({ book: 17, test: 4 });
  });
});
