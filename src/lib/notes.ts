import { MISTAKE_CAUSES } from '../data/constants';
import type { Mistake, Synonym } from '../types';
import { dateOfDay, inPlan, weekDays } from './plan';

export function causeLabel(key: string): string {
  return MISTAKE_CAUSES.find((c) => c.key === key)?.label ?? key;
}

export function causesFor(skill: 'listening' | 'reading') {
  return MISTAKE_CAUSES.filter((c) => c.skill === skill || c.skill === 'both');
}

// 本周时间范围：计划内按第 N 周（第 1–7 天…），计划外按自然周（周一到周日）
export function weekRange(startDate: string, currentDay: number, now = new Date()): { from: number; to: number; label: string } {
  if (inPlan(currentDay)) {
    const week = Math.ceil(currentDay / 7);
    const days = weekDays(week);
    const from = dateOfDay(startDate, days[0]);
    const to = dateOfDay(startDate, days[days.length - 1]);
    to.setDate(to.getDate() + 1);
    return { from: from.getTime(), to: to.getTime(), label: `第 ${week} 周` };
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7; // 周一为 0
  d.setDate(d.getDate() - offset);
  const end = new Date(d);
  end.setDate(end.getDate() + 7);
  return { from: d.getTime(), to: end.getTime(), label: '本周' };
}

export type CauseCount = { key: string; label: string; count: number };

export function weeklyCauseStats(mistakes: Mistake[], from: number, to: number): CauseCount[] {
  const counts = new Map<string, number>();
  for (const m of mistakes) {
    if (m.createdAt >= from && m.createdAt < to) counts.set(m.cause, (counts.get(m.cause) ?? 0) + 1);
  }
  const order = MISTAKE_CAUSES.map((c) => c.key as string);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: causeLabel(key), count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

// 复习顺序：reviewCount 少的优先，其次 lastReviewedAt 早的（从未复习的最先）
export function reviewOrder(cards: Synonym[]): Synonym[] {
  return [...cards].sort(
    (a, b) => a.reviewCount - b.reviewCount || (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0) || a.createdAt - b.createdAt,
  );
}

// 一轮复习的队列：没记住的卡片在本轮末尾再出现一次
export type ReviewRound = { queue: string[]; requeued: string[]; pos: number };

export function newRound(cards: Synonym[]): ReviewRound {
  return { queue: reviewOrder(cards).map((c) => c.id), requeued: [], pos: 0 };
}

export function answer(round: ReviewRound, remembered: boolean): ReviewRound {
  const id = round.queue[round.pos];
  const next = { ...round, pos: round.pos + 1 };
  if (!remembered && !round.requeued.includes(id)) {
    next.queue = [...round.queue, id];
    next.requeued = [...round.requeued, id];
  }
  return next;
}
