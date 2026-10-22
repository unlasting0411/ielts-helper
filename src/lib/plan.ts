import planData from '../data/plan.json';
import { PLAN_DAYS, VOCAB_TASK } from '../data/constants';
import type { DayPlan, Settings, Task } from '../types';

export const PLAN = planData as DayPlan[];

const MS_DAY = 86_400_000;

// 'YYYY-MM-DD' 按本地日期解析，避免时区偏移
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(from: string, to: Date): number {
  const a = parseISO(from);
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

// 第几天（可能 < 1 或 > 28）
export function dayNumber(startDate: string, now = new Date()): number {
  return daysBetween(startDate, now) + 1;
}

export function dateOfDay(startDate: string, day: number): Date {
  const d = parseISO(startDate);
  d.setDate(d.getDate() + day - 1);
  return d;
}

export function weekOfDay(day: number): number {
  return Math.min(4, Math.max(1, Math.ceil(day / 7)));
}

export function getDayPlan(day: number): DayPlan | undefined {
  return PLAN.find((d) => d.day === day);
}

export type DisplayTask = Task & { note3h?: string };
export type DisplayDay = DayPlan & { tasks: DisplayTask[]; isMock: boolean };

// 生成今日页显示的任务：追加单词卡片，3 小时版按规则改写
export function displayDay(day: number, dailyHours: Settings['dailyHours']): DisplayDay | undefined {
  const base = getDayPlan(day);
  if (!base) return undefined;
  let tasks: DisplayTask[] = base.tasks.map((t) => ({ ...t }));
  let isMock = base.type === 'mock';

  if (dailyHours === 3) {
    // 第 3 周模考只在第 15、19 天做；其余模考日按普通练习显示
    if (isMock && base.week === 3 && day !== 15 && day !== 19) {
      isMock = false;
      tasks = tasks.map((t) => ({ ...t, text: t.text.replace(/^模考：/, ''), timer: t.timer === 'mockFull' ? undefined : t.timer }));
    }

    if (!isMock) {
      const practiceLike = base.type === 'practice' || base.type === 'mock';
      tasks = tasks
        .filter((t) => {
          if (t.skill === 'writing') return day % 2 === 1;
          if (t.skill === 'speaking') return day % 2 === 0;
          return true;
        })
        .map((t) => {
          if (!practiceLike) return t;
          if (t.skill === 'reading') return { ...t, note3h: '3 小时版：限时 2 篇 + 复盘 1 篇', timer: undefined };
          if (t.skill === 'listening') return { ...t, note3h: '3 小时版：1 个 Section 限时 + 精听', timer: undefined };
          return t;
        });
    }
  }

  tasks.push({ ...VOCAB_TASK });
  return { ...base, tasks, isMock };
}

export function inPlan(day: number): boolean {
  return day >= 1 && day <= PLAN_DAYS;
}

// 一周的天数范围（按计划第 N 周：第 1–7、8–14、15–21、22–28 天）
export function weekDays(week: number): number[] {
  const start = (week - 1) * 7 + 1;
  return Array.from({ length: 7 }, (_, i) => start + i).filter((d) => d <= PLAN_DAYS);
}
