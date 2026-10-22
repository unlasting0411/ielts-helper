import { describe, expect, it } from 'vitest';
import { overallBand } from '../data/constants';
import type { FileMeta, Mistake, Synonym } from '../types';
import { matchTask } from './matcher';
import { answer, newRound, weeklyCauseStats } from './notes';
import { PLAN, dayNumber, displayDay } from './plan';
import { summarize } from './score';
import { guessTags } from './tagger';
import { newTimer, start, tick, view, pause } from './timer';

describe('overallBand（第七部分测试用例）', () => {
  it('rounds like IELTS', () => {
    expect(overallBand(8, 7.5, 6.5, 7)).toBe(7.5);
    expect(overallBand(8, 7.5, 6.5, 6.5)).toBe(7);
    expect(overallBand(7, 7, 7, 6.5)).toBe(7);
    expect(overallBand(6.5, 6.5, 6.5, 7.5)).toBe(7);
  });
});

describe('分数页验收', () => {
  it('35/33/6.5/7 → 8.0 / 7.5 / 29 / 7.5', () => {
    const s = summarize({ listeningRaw: 35, readingRaw: 33, writing: 6.5, speaking: 7 });
    expect(s.listening).toBe(8);
    expect(s.reading).toBe(7.5);
    expect(s.sum).toBe(29);
    expect(s.overall).toBe(7.5);
    expect(s.gap).toBe(0);
  });
  it('partial record has no overall', () => {
    const s = summarize({ listeningRaw: 30 });
    expect(s.complete).toBe(false);
    expect(s.overall).toBeUndefined();
    expect(s.sum).toBe(7);
  });
});

describe('计划数据', () => {
  it('has 28 days and day numbering', () => {
    expect(PLAN).toHaveLength(28);
    const start = '2026-10-01';
    expect(dayNumber(start, new Date(2026, 9, 1, 23, 0))).toBe(1);
    expect(dayNumber(start, new Date(2026, 9, 14))).toBe(14);
    expect(dayNumber(start, new Date(2026, 8, 30))).toBe(0);
  });
  it('appends vocab card every day', () => {
    for (let d = 1; d <= 28; d++) expect(displayDay(d, 6)!.tasks.at(-1)!.key).toBe('V');
  });
  it('3 小时版规则', () => {
    const d2 = displayDay(2, 3)!; // 双数天：口语
    expect(d2.tasks.map((t) => t.key)).toEqual(['L', 'R', 'S', 'V']);
    expect(d2.tasks[1].note3h).toContain('限时 2 篇');
    const d3 = displayDay(3, 3)!; // 单数天：写作
    expect(d3.tasks.map((t) => t.key)).toEqual(['L', 'R', 'W', 'V']);
    expect(displayDay(17, 3)!.isMock).toBe(false);
    expect(displayDay(15, 3)!.isMock).toBe(true);
    expect(displayDay(22, 3)!.tasks.map((t) => t.key)).toEqual(['L', 'R', 'W', 'S', 'V']);
  });
});

describe('文件名识别', () => {
  it('recognizes common names', () => {
    expect(guessTags('剑19 Test 1 阅读.pdf', 'application/pdf')).toMatchObject({ book: 19, test: 1, skill: 'reading', category: 'test' });
    expect(guessTags('Cambridge IELTS 15 Test 1 Section 2.mp3', 'audio/mpeg')).toMatchObject({ book: 15, test: 1, section: 2, skill: 'listening', category: 'audio' });
    expect(guessTags('C17T3S4.mp3', 'audio/mpeg')).toMatchObject({ book: 17, test: 3, section: 4 });
    expect(guessTags('剑18 第二套 听力.pdf', 'application/pdf')).toMatchObject({ book: 18, test: 2, skill: 'listening' });
    expect(guessTags('剑16 解析.pdf', 'application/pdf')).toMatchObject({ book: 16, category: 'answer' });
    expect(guessTags('剑20.pdf', 'application/pdf')).toMatchObject({ book: 20, test: undefined, skill: 'all', category: 'test' });
    expect(guessTags('口语话题讲义.pdf', 'application/pdf')).toMatchObject({ category: 'speaking', book: undefined });
    expect(guessTags('random notes.pdf', 'application/pdf')).toMatchObject({ category: 'other', book: undefined });
  });
});

function meta(p: Partial<FileMeta>): FileMeta {
  return { id: Math.random().toString(), name: 'x.pdf', mime: 'application/pdf', size: 1, category: 'test', bookmarks: [], importedAt: 0, ...p };
}

describe('任务与文件匹配', () => {
  const ref = { book: 19, test: 1, skill: 'reading' };
  it('exact > test-all > whole book > missing', () => {
    const exact = meta({ book: 19, test: 1, skill: 'reading' });
    const all = meta({ book: 19, test: 1, skill: 'all' });
    const whole = meta({ book: 19, skill: 'all', bookmarks: [{ label: 'T1 阅读', page: 23 }] });
    expect(matchTask(ref, [whole, all, exact]).pdf).toBe(exact);
    expect(matchTask(ref, [whole, all]).pdf).toBe(all);
    const w = matchTask(ref, [whole]);
    expect(w.pdf).toBe(whole);
    expect(w.page).toBe(23);
    const none = matchTask(ref, []);
    expect(none.pdf).toBeUndefined();
    expect(none.missing).toBe('剑19 Test 1 阅读');
  });
  it('listening finds audio sorted by section', () => {
    const a2 = meta({ name: 'b.mp3', mime: 'audio/mpeg', category: 'audio', book: 15, test: 1, section: 2 });
    const a1 = meta({ name: 'a.mp3', mime: 'audio/mpeg', category: 'audio', book: 15, test: 1, section: 1 });
    const r = matchTask({ book: 15, test: 1, skill: 'listening' }, [a2, a1, meta({ book: 15, test: 1, skill: 'listening' })]);
    expect(r.audios).toEqual([a1, a2]);
    expect(r.pdf).toBeDefined();
  });
});

describe('计时', () => {
  it('reading60 alerts at 20/40 and ends at 60', () => {
    let s = start(newTimer('reading60'), 0);
    const at = (min: number) => {
      const r = tick(s, min * 60_000);
      s = r.state;
      return r.events.map((e) => e.kind);
    };
    expect(at(19)).toEqual([]);
    expect(at(20)).toEqual(['alert']);
    expect(at(40)).toEqual(['alert']);
    expect(at(60)).toEqual(['end']);
  });
  it('survives background (timestamps)', () => {
    let s = start(newTimer('listening30'), 1000);
    s = tick(s, 1000 + 60_000).state;
    // 切到后台 2 分钟，回来时直接按时间戳计算
    expect(view(s, 1000 + 180_000).totalRemainingSec).toBe(1800 - 180);
  });
  it('pause keeps elapsed', () => {
    let s = start(newTimer('writingT1'), 0);
    s = pause(s, 60_000);
    expect(view(s, 600_000).elapsedSec).toBe(60);
  });
  it('mockFull chains segments', () => {
    let s = start(newTimer('mockFull'), 0);
    const r1 = tick(s, 1800_000);
    expect(r1.events).toContainEqual({ kind: 'segment', index: 1, name: '阅读' });
    s = r1.state;
    const r2 = tick(s, 5400_000);
    expect(r2.events).toContainEqual({ kind: 'segment', index: 2, name: '写作' });
    expect(view(r2.state, 5400_000).segName).toBe('写作');
  });
  it('speaking P2 auto-continues to answer', () => {
    const s = start(newTimer('speakingP2'), 0);
    const v = view(s, 61_000);
    expect(v.segName).toBe('作答');
    expect(Math.round(v.segRemainingSec)).toBe(119);
  });
});

describe('笔记', () => {
  it('weekly stats sorted desc', () => {
    const mk = (cause: string, t: number): Mistake => ({ id: cause + t, source: '', skill: 'reading', myAnswer: '', correctAnswer: '', cause, createdAt: t });
    const list = [mk('locate', 5), mk('vocab', 6), mk('locate', 7), mk('tfng', 8), mk('locate', 9), mk('vocab', 10), mk('time', 100)];
    const stats = weeklyCauseStats(list, 0, 50);
    expect(stats.map((s) => [s.key, s.count])).toEqual([['locate', 3], ['vocab', 2], ['tfng', 1]]);
  });
  it('forgotten card reappears once at end of round', () => {
    const c = (id: string, n: number): Synonym => ({ id, question: id, original: id, reviewCount: n, createdAt: 0 });
    let r = newRound([c('b', 2), c('a', 0), c('c', 5)]);
    expect(r.queue).toEqual(['a', 'b', 'c']);
    r = answer(r, false); // a 没记住
    r = answer(r, true);
    r = answer(r, true);
    expect(r.queue).toEqual(['a', 'b', 'c', 'a']);
    r = answer(r, false); // 第二次仍没记住，不再追加
    expect(r.queue).toHaveLength(4);
    expect(r.pos).toBe(4);
  });
});
