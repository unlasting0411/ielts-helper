import { Library } from './pages/Library';
import { Notes } from './pages/Notes';
import { Scores } from './pages/Scores';
import { SettingsPage } from './pages/Settings';
import { TimerPage } from './pages/Timer';
import { Today } from './pages/Today';
import { timer, useTimer } from './timerStore';
import { useEffect, useState } from 'preact/hooks';
import { Icon, Modal, Toasts, go, goHome, useRoute } from './ui';

// 阅读器含 pdf.js，按需加载（Service Worker 仍会预缓存，离线可用）
type ViewerType = typeof import('./pages/Viewer').Viewer;
let ViewerCache: ViewerType | null = null;
function LazyViewer({ query }: { query: URLSearchParams }) {
  const [V, setV] = useState<ViewerType | null>(() => ViewerCache);
  useEffect(() => {
    if (!V) import('./pages/Viewer').then((m) => { ViewerCache = m.Viewer; setV(() => m.Viewer); });
  }, []);
  return V ? <V query={query} /> : <div class="empty">正在打开阅读器…</div>;
}

const NAV = [
  { path: '/today', label: '今日', icon: 'today' },
  { path: '/library', label: '资料', icon: 'library' },
  { path: '/timer', label: '计时', icon: 'timer' },
  { path: '/scores', label: '分数', icon: 'scores' },
  { path: '/notes', label: '笔记', icon: 'notes' },
];

const TITLES: Record<string, string> = {
  '/today': '今日',
  '/library': '资料库',
  '/timer': '计时',
  '/scores': '分数',
  '/notes': '笔记',
  '/settings': '设置',
};

export function App() {
  const route = useRoute();
  const t = useTimer();

  let page;
  switch (route.path) {
    case '/library': page = <Library />; break;
    case '/timer': page = <TimerPage />; break;
    case '/scores': page = <Scores query={route.query} />; break;
    case '/notes': page = <Notes query={route.query} />; break;
    case '/settings': page = <SettingsPage />; break;
    case '/view': page = <LazyViewer query={route.query} />; break;
    default: page = <Today query={route.query} />;
  }

  if (route.path === '/view') {
    return (
      <>
        {page}
        <ScorePrompt ask={t?.askScore ?? null} />
        <Toasts />
      </>
    );
  }

  return (
    <div class="app">
      <header class="topbar">
        {route.path === '/settings' && (
          <button class="iconbtn" aria-label="返回" onClick={goHome}><Icon name="back" /></button>
        )}
        <h1>{TITLES[route.path] ?? '今日'}</h1>
        {route.path !== '/settings' && (
          <button class="iconbtn" aria-label="设置" onClick={() => go('/settings')}><Icon name="settings" /></button>
        )}
      </header>
      <main class="content">{page}</main>
      <nav class="bottomnav" aria-label="主导航">
        <div class="inner">
          {NAV.map((n) => (
            <a
              href={`#${n.path}`}
              onClick={(e) => {
                e.preventDefault();
                go(n.path);
              }}
              class={route.path === n.path || (n.path === '/today' && !TITLES[route.path]) ? 'active' : ''}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </div>
      </nav>
      <ScorePrompt ask={t?.askScore ?? null} />
      <Toasts />
    </div>
  );
}

// 阅读、听力计时结束后询问是否录入分数
function ScorePrompt({ ask }: { ask: { day?: number; label?: string } | null }) {
  if (!ask) return null;
  const close = () => timer.takeAskScore();
  return (
    <Modal title="时间到" onClose={close}>
      <p style="margin:0">现在录入分数吗？</p>
      <div class="row">
        <button class="btn grow" onClick={close}>稍后</button>
        <button
          class="btn primary grow"
          onClick={() => {
            close();
            go('/scores', { new: 1, day: ask.day, label: ask.label });
          }}
        >
          去录入
        </button>
      </div>
    </Modal>
  );
}
