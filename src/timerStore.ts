import { useEffect, useState } from 'preact/hooks';
import { asksForScore, newTimer, pause, start, tick, view, type TimerEvent, type TimerState, type TimerView } from './lib/timer';
import { toast } from './ui';

// 全局计时器：任意页面都能看到同一个计时；状态保存在 localStorage（数据很小），刷新或切后台回来仍准确
const KEY = 'ielts-helper.timer';

export type TimerContext = { day?: number; label?: string };
type Stored = { state: TimerState; ctx: TimerContext };

let current: Stored | null = load();
let lastAlert: string | null = null;
let askScore: TimerContext | null = null;
const subs = new Set<() => void>();

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function save() {
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch { /* 忽略 */ }
}
function notify() {
  save();
  subs.forEach((f) => f());
  syncWakeLock();
}

// ---- 提醒：震动 + 短提示音 + 屏幕文字 ----
let audioCtx: AudioContext | null = null;
function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch { /* 不支持时忽略 */ }
}
function beep(times = 1) {
  try {
    unlockAudio();
    const ctx = audioCtx!;
    for (let i = 0; i < times; i++) {
      const t0 = ctx.currentTime + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
  } catch { /* 忽略 */ }
}
function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* 忽略 */ }
}

function handle(ev: TimerEvent) {
  if (ev.kind === 'alert') {
    lastAlert = ev.text;
    vibrate([300, 150, 300]);
    beep(2);
    toast(`⏰ ${ev.text}`, undefined, 8000);
  } else if (ev.kind === 'segment') {
    lastAlert = `开始：${ev.name}`;
    vibrate(400);
    beep(1);
    toast(`下一段开始：${ev.name}`, undefined, 6000);
  } else {
    lastAlert = '时间到';
    vibrate([500, 200, 500, 200, 500]);
    beep(3);
    if (current && asksForScore(current.state.presetKey)) askScore = { ...current.ctx };
    else toast('时间到', undefined, 8000);
  }
}

function step() {
  if (!current || current.state.runningSince == null) return;
  const r = tick(current.state, Date.now());
  if (r.events.length || r.state !== current.state) {
    current = { ...current, state: r.state };
    r.events.forEach(handle);
    notify();
  } else {
    subs.forEach((f) => f());
  }
}

setInterval(step, 250);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    step();
    syncWakeLock();
  }
});

// ---- 屏幕常亮（不支持时忽略）----
let wakeLock: WakeLockSentinel | null = null;
async function syncWakeLock() {
  const want = !!current && current.state.runningSince != null;
  try {
    if (want && !wakeLock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}

// ---- 对外接口 ----
export const timer = {
  get: () => current,
  start(presetKey: string, ctx: TimerContext = {}) {
    unlockAudio();
    lastAlert = null;
    current = { state: start(newTimer(presetKey), Date.now()), ctx };
    notify();
  },
  resume() {
    if (!current) return;
    unlockAudio();
    current = { ...current, state: start(current.state, Date.now()) };
    notify();
  },
  pause() {
    if (!current) return;
    current = { ...current, state: pause(current.state, Date.now()) };
    notify();
  },
  reset() {
    current = null;
    lastAlert = null;
    notify();
  },
  isActive: () => !!current && !current.state.finished,
  takeAskScore(): TimerContext | null {
    const a = askScore;
    askScore = null;
    subs.forEach((f) => f());
    return a;
  },
};

export type TimerSnapshot = { stored: Stored; v: TimerView; lastAlert: string | null; askScore: TimerContext | null } | null;

export function useTimer(): TimerSnapshot {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  if (!current) return null;
  return { stored: current, v: view(current.state, Date.now()), lastAlert, askScore };
}
