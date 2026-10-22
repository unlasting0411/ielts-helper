import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getAll, getSettings, onChange, type StoreName } from './db';
import type { Settings } from './types';

// ---------- 路由（hash）----------
// 历史记录最多两层：底层永远是“今日”（主界面），其他页面都是它的子页面，只占一层。
// 所以手机返回键在任何子页面都回到今日，在今日再按返回则退出 App。
export type Route = { path: string; query: URLSearchParams };

export const HOME = '/today';

function parseHash(): Route {
  const h = location.hash.replace(/^#/, '') || HOME;
  const [path, qs] = h.split('?');
  return { path, query: new URLSearchParams(qs ?? '') };
}

const isHome = (path: string) => path === HOME || path === '/' || path === '';
const onSubEntry = () => (history.state as { sub?: boolean } | null)?.sub === true;
const emitRoute = () => dispatchEvent(new Event('routechange'));

// 回到今日后要套用的参数（例如 ?day=3）；在 popstate 后用 replaceState 写入
let pendingHome: string | null = null;

addEventListener('popstate', () => {
  if (pendingHome != null && !onSubEntry()) {
    history.replaceState({ home: true }, '', pendingHome);
    pendingHome = null;
  }
  emitRoute();
});

// 启动时整理历史：直接打开子页面（刷新、深链接）时在下面垫一层今日
export function initHistory() {
  const { path } = parseHash();
  if (isHome(path) || onSubEntry()) return;
  const sub = location.hash;
  history.replaceState({ home: true }, '', `#${HOME}`);
  history.pushState({ sub: true }, '', sub);
}

export function useRoute(): Route {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const fn = () => setR(parseHash());
    addEventListener('hashchange', fn);
    addEventListener('routechange', fn);
    return () => {
      removeEventListener('hashchange', fn);
      removeEventListener('routechange', fn);
    };
  }, []);
  return r;
}

export function go(path: string, query?: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  const url = `#${s ? `${path}?${s}` : path}`;
  if (isHome(path)) {
    if (onSubEntry()) {
      // 从子页面回主界面：退回底层那条记录，而不是再压一层
      pendingHome = url;
      history.back();
      return;
    }
    history.replaceState({ home: true }, '', url);
  } else if (onSubEntry()) {
    history.replaceState({ sub: true }, '', url); // 子页面之间切换：替换，不加层
  } else {
    history.pushState({ sub: true }, '', url);
  }
  emitRoute();
}

// 返回主界面（顶部返回按钮用）
export function goHome() {
  go(HOME);
}

// ---------- 数据 hooks ----------
export function useStore<S extends Exclude<StoreName, 'fileBlobs'>>(store: S) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getAll<S>>> | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getAll(store).then((r) => alive && setRows(r));
    load();
    const off = onChange((s) => s === store && load());
    return () => { alive = false; off(); };
  }, [store]);
  return rows;
}

export function useSettings(): Settings | null | undefined {
  // undefined = 加载中；null = 尚未设置
  const [s, setS] = useState<Settings | null | undefined>(undefined);
  useEffect(() => {
    const load = () => getSettings().then((v) => setS(v ?? null));
    load();
    return onChange((st) => st === 'settings' && load());
  }, []);
  return s;
}

// ---------- 提示 ----------
export type Toast = { id: number; text: string; action?: { label: string; run: () => void }; ms?: number };
let toasts: Toast[] = [];
const toastSubs = new Set<(t: Toast[]) => void>();
let toastSeq = 0;

export function toast(text: string, action?: Toast['action'], ms = 3500) {
  const t = { id: ++toastSeq, text, action, ms };
  toasts = [...toasts, t].slice(-3);
  toastSubs.forEach((f) => f(toasts));
  setTimeout(() => dismissToast(t.id), ms);
}
function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  toastSubs.forEach((f) => f(toasts));
}

export function Toasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    toastSubs.add(setList);
    return () => toastSubs.delete(setList);
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div class="toast" key={t.id}>
          <div class="grow">{t.text}</div>
          {t.action && (
            <button class="btn small" onClick={() => { dismissToast(t.id); t.action!.run(); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 弹窗 ----------
export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="row between">
          <h3>{props.title}</h3>
          <button class="iconbtn" aria-label="关闭" onClick={props.onClose}><Icon name="close" /></button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

// ---------- 小工具 ----------
export function fmtBytes(n: number | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function numOrUndef(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ---------- 图标（内联 SVG，无外部请求）----------
const ICONS: Record<string, string> = {
  today: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5ZM8.5 14.5l2 2 4.5-4.5',
  library: 'M4 4.5h5a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4zM20 4.5h-5a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H20z',
  timer: 'M10 2h4M12 14V9.5M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  scores: 'M4 20V4M4 20h16M8 16l3.5-4 3 2.5L19 9',
  notes: 'M6 3.5h9l3.5 3.5v13.5H6zM15 3.5V7h3.5M9 11.5h6M9 15h6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  bookmark: 'M6.5 3.5h11v17l-5.5-4-5.5 4z',
  split: 'M4 4.5h16v15H4zM4 12h16',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
};

export function Icon({ name }: { name: string }) {
  const fill = name === 'play' || name === 'pause';
  return (
    <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={fill ? 0 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
