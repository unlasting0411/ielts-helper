import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearAll, exportData, getAll, importData, put, setTaskDone } from './db';

describe('导出 → 清空 → 导入', () => {
  it('restores scores, mistakes, synonyms, progress and settings', async () => {
    await put('settings', { id: 'main', startDate: '2026-10-01', examMode: 'paper', dailyHours: 6 });
    await put('scores', { id: 's1', day: 1, label: '剑19 Test 1', listeningRaw: 35, readingRaw: 33, writing: 6.5, speaking: 7, createdAt: 1 });
    await put('mistakes', { id: 'm1', source: '剑15 T2 S1 Q4', skill: 'listening', myAnswer: 'a', correctAnswer: 'b', cause: 'spelling', createdAt: 2 });
    await put('synonyms', { id: 'y1', question: 'rise', original: 'increase', reviewCount: 0, createdAt: 3 });
    await setTaskDone(1, 'L', true);

    const data = JSON.parse(JSON.stringify(await exportData()));
    await clearAll();
    expect(await getAll('scores')).toHaveLength(0);

    const n = await importData(data);
    expect(n).toBe(5);
    expect((await getAll('scores'))[0].listeningRaw).toBe(35);
    expect((await getAll('mistakes'))[0].cause).toBe('spelling');
    expect((await getAll('synonyms'))[0].original).toBe('increase');
    expect((await getAll('progress'))[0]).toMatchObject({ id: '1-L', done: true });
    expect((await getAll('settings'))[0].examMode).toBe('paper');
  });

  it('round-trips answer keys, attempts and essays (v2)', async () => {
    await clearAll();
    await put('answerKeys', { id: '15-1-reading', book: 15, test: 1, skill: 'reading', answers: ['A', 'TRUE'], updatedAt: 1 });
    await put('attempts', { id: 'a1', book: 15, test: 1, skill: 'reading', answers: ['A', 'F'], correct: [true, false], raw: 1, submittedAt: 2, createdAt: 2 });
    await put('essays', { id: 'e1', task: 'T2', prompt: 'p', text: 'Some text here.', createdAt: 3, updatedAt: 3 });
    const data = JSON.parse(JSON.stringify(await exportData()));
    await clearAll();
    expect(await importData(data)).toBe(3);
    expect((await getAll('answerKeys'))[0].answers).toEqual(['A', 'TRUE']);
    expect((await getAll('attempts'))[0].raw).toBe(1);
    expect((await getAll('essays'))[0].text).toBe('Some text here.');
  });

  it('rejects foreign files', async () => {
    await expect(importData({ foo: 1 } as never)).rejects.toThrow();
  });
});
