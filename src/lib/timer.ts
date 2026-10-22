import { ALERT_TEXTS, TIMER_PRESETS, type TimerPreset } from '../data/constants';

// 计时状态全部基于时间戳，切到后台再回来仍然准确
export type TimerState = {
  presetKey: string;
  accumulatedMs: number;       // 暂停前累计的毫秒
  runningSince: number | null; // 正在运行时的起点时间戳
  fired: number[];             // 已触发的提醒（秒）
  segFired: number;            // 已经通知过的段落切换次数
  finished: boolean;
};

export type TimerView = {
  preset: TimerPreset;
  elapsedSec: number;
  totalSec: number;
  segIndex: number;
  segName: string;
  segRemainingSec: number;
  totalRemainingSec: number;
  done: boolean;
  running: boolean;
};

export type TimerEvent =
  | { kind: 'alert'; sec: number; text: string }
  | { kind: 'segment'; index: number; name: string }
  | { kind: 'end' };

export function newTimer(presetKey: string): TimerState {
  return { presetKey, accumulatedMs: 0, runningSince: null, fired: [], segFired: 0, finished: false };
}

export function elapsedMs(s: TimerState, now: number): number {
  return s.accumulatedMs + (s.runningSince != null ? now - s.runningSince : 0);
}

export function totalSec(p: TimerPreset): number {
  return p.segments.reduce((a, b) => a + b.sec, 0);
}

export function view(s: TimerState, now: number): TimerView {
  const preset = TIMER_PRESETS[s.presetKey];
  const total = totalSec(preset);
  const elapsed = Math.min(total, elapsedMs(s, now) / 1000);
  let acc = 0;
  let segIndex = preset.segments.length - 1;
  for (let i = 0; i < preset.segments.length; i++) {
    if (elapsed < acc + preset.segments[i].sec) { segIndex = i; break; }
    acc += preset.segments[i].sec;
  }
  if (segIndex === preset.segments.length - 1) {
    acc = total - preset.segments[segIndex].sec;
  }
  return {
    preset,
    elapsedSec: elapsed,
    totalSec: total,
    segIndex,
    segName: preset.segments[segIndex].name,
    segRemainingSec: Math.max(0, acc + preset.segments[segIndex].sec - elapsed),
    totalRemainingSec: Math.max(0, total - elapsed),
    done: elapsed >= total,
    running: s.runningSince != null,
  };
}

export function start(s: TimerState, now: number): TimerState {
  if (s.runningSince != null || s.finished) return s;
  return { ...s, runningSince: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.runningSince == null) return s;
  return { ...s, accumulatedMs: elapsedMs(s, now), runningSince: null };
}

// 计算到 now 为止应触发但尚未触发的事件，返回新状态和事件列表。
// 从后台回来时可能一次积压多个提醒：全部标记为已触发，但只返回最近的一个提醒，避免连响。
export function tick(s: TimerState, now: number): { state: TimerState; events: TimerEvent[] } {
  if (s.finished) return { state: s, events: [] };
  const preset = TIMER_PRESETS[s.presetKey];
  const v = view(s, now);
  const events: TimerEvent[] = [];
  let state = s;

  const dueAlerts = preset.alerts.filter((a) => a <= v.elapsedSec && !s.fired.includes(a));
  if (dueAlerts.length) {
    state = { ...state, fired: [...state.fired, ...dueAlerts] };
    const last = dueAlerts[dueAlerts.length - 1];
    events.push({ kind: 'alert', sec: last, text: ALERT_TEXTS[`${s.presetKey}@${last}`] ?? '提醒' });
  }

  // 段落切换：segIndex 已越过的段数
  const crossed = v.done ? preset.segments.length - 1 : v.segIndex;
  if (crossed > state.segFired) {
    state = { ...state, segFired: crossed };
    if (!v.done) events.push({ kind: 'segment', index: v.segIndex, name: v.segName });
  }

  if (v.done) {
    state = { ...state, finished: true, accumulatedMs: v.totalSec * 1000, runningSince: null };
    events.push({ kind: 'end' });
  }
  return { state, events };
}

// 结束后需要询问是否录入分数的预设（阅读和听力）
export function asksForScore(presetKey: string): boolean {
  return presetKey === 'listening30' || presetKey === 'reading60' || presetKey === 'mockFull';
}

export function fmtClock(sec: number): string {
  const s = Math.ceil(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(2, '0');
  const sss = String(ss).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}
