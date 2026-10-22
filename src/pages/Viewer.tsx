import { useEffect, useRef, useState } from 'preact/hooks';
import { AudioPlayer } from '../components/AudioPlayer';
import { PdfView } from '../components/PdfView';
import { TIMER_PRESETS } from '../data/constants';
import { getFileMeta } from '../db';
import { refLabel } from '../lib/matcher';
import { isAudio, isPdf } from '../lib/tagger';
import { fmtClock } from '../lib/timer';
import { timer, useTimer } from '../timerStore';
import type { FileMeta } from '../types';
import { Icon, Modal, go, useStore } from '../ui';

// 阅读器：PDF（可上下分屏看第二个 PDF）+ 底部音频控制条 + 悬浮计时器
export function Viewer({ query }: { query: URLSearchParams }) {
  const pdf = query.get('pdf') ?? undefined;
  const pdf2 = query.get('pdf2') ?? undefined;
  const page = Number(query.get('page')) || undefined;
  const audioIds = (query.get('audio') ?? '').split(',').filter(Boolean);
  const [title, setTitle] = useState('');
  const [picker, setPicker] = useState<null | 'pdf' | 'pdf2' | 'audio'>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [ratio, setRatio] = useState(0.5);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = pdf ?? audioIds[0];
    if (id) getFileMeta(id).then((m) => setTitle(m ? (m.book != null && m.test != null ? refLabel(m) : m.name) : ''));
  }, [pdf, audioIds[0]]);

  // 用 replace 风格更新参数；换主 PDF 后不再沿用初始页码
  const params = (patch: Record<string, string | undefined>) =>
    go('/view', { pdf, pdf2, audio: audioIds.join(',') || undefined, page: 'pdf' in patch ? undefined : page, ...patch });

  // 拖动分隔线
  const startDrag = (e: PointerEvent) => {
    const body = bodyRef.current;
    if (!body) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = body.getBoundingClientRect();
    const move = (ev: PointerEvent) => setRatio(Math.min(0.85, Math.max(0.15, (ev.clientY - rect.top) / rect.height)));
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  return (
    <div class="viewer">
      <div class="viewer-top">
        <button class="iconbtn" aria-label="返回" onClick={() => (history.length > 1 ? history.back() : go('/library'))}><Icon name="back" /></button>
        <div class="title ellipsis">{title || '阅读器'}</div>
        <button class="iconbtn" aria-label="计时器" onClick={() => setTimerOpen(true)}><Icon name="timer" /></button>
        {pdf && (
          <button class="iconbtn" aria-label={pdf2 ? '关闭分屏' : '分屏打开第二个 PDF'} onClick={() => (pdf2 ? params({ pdf2: undefined }) : setPicker('pdf2'))}>
            <Icon name={pdf2 ? 'close' : 'split'} />
          </button>
        )}
        {audioIds.length === 0 && (
          <button class="iconbtn" aria-label="同屏播放音频" onClick={() => setPicker('audio')}><Icon name="music" /></button>
        )}
      </div>

      <div class="viewer-body" ref={bodyRef}>
        {pdf ? (
          <>
            <div style={{ flex: pdf2 ? `0 0 ${ratio * 100}%` : '1', minHeight: 0, display: 'flex' }}>
              <PdfView key={pdf} fileId={pdf} initialPage={page} />
            </div>
            {pdf2 && (
              <>
                <div class="divider" role="separator" aria-label="拖动调整分屏" onPointerDown={startDrag} />
                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                  <PdfView key={pdf2} fileId={pdf2} />
                </div>
              </>
            )}
          </>
        ) : (
          <div class="empty" style="flex:1">
            <p>只打开了音频。</p>
            <button class="btn" onClick={() => setPicker('pdf')}>同屏打开题目 PDF</button>
          </div>
        )}
      </div>

      {audioIds.length > 0 && <AudioPlayer ids={audioIds} />}

      <FloatingTimer onOpen={() => setTimerOpen(true)} />
      {timerOpen && <TimerSheet onClose={() => setTimerOpen(false)} />}
      {picker && (
        <FilePicker
          kind={picker === 'audio' ? 'audio' : 'pdf'}
          title={picker === 'pdf2' ? '选择要分屏打开的 PDF（如解析）' : picker === 'audio' ? '选择音频' : '选择 PDF'}
          exclude={pdf}
          onPick={(f) => {
            setPicker(null);
            if (picker === 'audio') params({ audio: f.id });
            else if (picker === 'pdf2') params({ pdf2: f.id });
            else params({ pdf: f.id, page: undefined });
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function FloatingTimer({ onOpen }: { onOpen: () => void }) {
  const t = useTimer();
  if (!t || t.v.done) return null;
  const multi = t.v.preset.segments.length > 1;
  return (
    <button class="float-timer" onClick={onOpen} aria-label="打开计时器">
      {!t.v.running && '⏸ '}
      {multi && `${t.v.segName} `}
      {fmtClock(multi ? t.v.segRemainingSec : t.v.totalRemainingSec)}
    </button>
  );
}

function TimerSheet({ onClose }: { onClose: () => void }) {
  const t = useTimer();
  return (
    <Modal title="计时" onClose={onClose}>
      {t && !t.v.done ? (
        <>
          <div class="row between"><b>{t.v.preset.label}</b><span class="muted">{t.v.segName}</span></div>
          <div class="clock" style="font-size:56px">{fmtClock(t.v.segRemainingSec)}</div>
          {t.lastAlert && <div class="banner warn">{t.lastAlert}</div>}
          <div class="row">
            {t.v.running ? (
              <button class="btn primary grow" onClick={() => timer.pause()}>暂停</button>
            ) : (
              <button class="btn primary grow" onClick={() => timer.resume()}>继续</button>
            )}
            <button class="btn grow" onClick={() => confirm('重置当前计时？') && timer.reset()}>重置</button>
          </div>
        </>
      ) : (
        <>
          <div class="small muted">选一个预设，计时器会悬浮在阅读器上。</div>
          <div class="preset-grid">
            {Object.entries(TIMER_PRESETS).map(([k, p]) => (
              <button class="btn" onClick={() => { timer.start(k); onClose(); }}>{p.label}</button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function FilePicker(props: { kind: 'pdf' | 'audio'; title: string; exclude?: string; onPick: (f: FileMeta) => void; onClose: () => void }) {
  const files = useStore('files');
  const list = (files ?? [])
    .filter((f) => f.id !== props.exclude && (props.kind === 'pdf' ? isPdf(f.name, f.mime) : isAudio(f.name, f.mime)))
    .sort((a, b) => (a.category === 'answer' ? -1 : 0) - (b.category === 'answer' ? -1 : 0) || (a.book ?? 99) - (b.book ?? 99) || a.name.localeCompare(b.name));
  return (
    <Modal title={props.title} onClose={props.onClose}>
      {list.length === 0 && <div class="empty small">资料库里没有可选的文件</div>}
      <div class="list">
        {list.map((f) => (
          <button class="item btn ghost block" style="justify-content:flex-start;text-align:left" onClick={() => props.onPick(f)}>
            <div class="grow" style="min-width:0">
              <div class="ellipsis">{f.name}</div>
              {f.book != null && <div class="small muted">{refLabel(f)}</div>}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
