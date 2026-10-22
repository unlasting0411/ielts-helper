import { useEffect, useRef, useState } from 'preact/hooks';
import { AnswerSheet } from '../components/AnswerSheet';
import { AudioPlayer } from '../components/AudioPlayer';
import { EssayEditor, createEssay } from '../components/EssayEditor';
import { PdfView } from '../components/PdfView';
import { TIMER_PRESETS } from '../data/constants';
import { getFileMeta } from '../db';
import { refLabel } from '../lib/matcher';
import { isAudio, isPdf } from '../lib/tagger';
import { fmtClock } from '../lib/timer';
import { timer, useTimer } from '../timerStore';
import type { FileMeta, PracticeSkill } from '../types';
import { Icon, Modal, go, goHome, numOrUndef, useStore } from '../ui';

type Pane = 'pdf2' | 'sheet' | 'essay' | null;

// 阅读器：PDF + 下半屏（第二个 PDF / 答题卡 / 写作）+ 底部音频控制条 + 悬浮计时器
export function Viewer({ query }: { query: URLSearchParams }) {
  const pdf = query.get('pdf') ?? undefined;
  const pdf2 = query.get('pdf2') ?? undefined;
  const sheet = query.get('sheet') ?? undefined; // `15-1-reading`，或 `auto`（按 PDF 标签）
  const essay = query.get('essay') ?? undefined;
  const day = numOrUndef(query.get('day') ?? '');
  const page = Number(query.get('page')) || undefined;
  const audioIds = (query.get('audio') ?? '').split(',').filter(Boolean);
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [picker, setPicker] = useState<null | 'pdf' | 'pdf2' | 'audio'>(null);
  const [paneMenu, setPaneMenu] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [ratio, setRatio] = useState(0.5);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pane: Pane = pdf2 ? 'pdf2' : sheet ? 'sheet' : essay ? 'essay' : null;

  useEffect(() => {
    const id = pdf ?? audioIds[0];
    if (id) getFileMeta(id).then((m) => setMeta(m ?? null));
  }, [pdf, audioIds[0]]);
  const title = meta ? (meta.book != null && meta.test != null ? refLabel(meta) : meta.name) : '';

  // 答题卡对应哪套题：参数优先，否则按当前 PDF / 音频的标签
  const sheetRef = (() => {
    const m = sheet?.match(/^(\d+)-(\d+)-(listening|reading)$/);
    if (m) return { book: Number(m[1]), test: Number(m[2]), skill: m[3] as PracticeSkill };
    const sk = meta?.skill === 'listening' || meta?.skill === 'reading' ? meta.skill : meta?.category === 'audio' ? 'listening' : undefined;
    return { book: meta?.book, test: meta?.test, skill: sk as PracticeSkill | undefined };
  })();

  // 用 replace 风格更新参数；换主 PDF 后不再沿用初始页码
  const params = (patch: Record<string, string | undefined>) =>
    go('/view', { pdf, pdf2, sheet, essay, day: day?.toString(), audio: audioIds.join(',') || undefined, page: 'pdf' in patch ? undefined : page, ...patch });
  const setPane = (p: Pane, extra: Record<string, string | undefined> = {}) =>
    params({ pdf2: undefined, sheet: undefined, essay: undefined, ...(p === 'sheet' ? { sheet: 'auto' } : {}), ...extra });

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

  const paneContent =
    pane === 'pdf2' ? (
      <PdfView key={pdf2} fileId={pdf2!} />
    ) : pane === 'sheet' ? (
      <div class="pane-scroll">
        <AnswerSheet key={`${sheetRef.book}-${sheetRef.test}-${sheetRef.skill}`} book={sheetRef.book} test={sheetRef.test} skill={sheetRef.skill} day={day} compact />
      </div>
    ) : pane === 'essay' ? (
      <div class="pane-scroll">
        <EssayEditor key={essay} id={essay!} onOpen={(id) => params({ essay: id })} onDeleted={() => setPane(null)} />
      </div>
    ) : null;

  return (
    <div class="viewer">
      <div class="viewer-top">
        <button class="iconbtn" aria-label="返回" onClick={goHome}><Icon name="back" /></button>
        <div class="title ellipsis">{title || '阅读器'}</div>
        <button class="iconbtn" aria-label="计时器" onClick={() => setTimerOpen(true)}><Icon name="timer" /></button>
        <button class="iconbtn" aria-label={pane ? '关闭下半屏' : '下半屏：答题卡、写作或第二个 PDF'} onClick={() => (pane ? setPane(null) : setPaneMenu(true))}>
          <Icon name={pane ? 'close' : 'split'} />
        </button>
        {audioIds.length === 0 && (
          <button class="iconbtn" aria-label="同屏播放音频" onClick={() => setPicker('audio')}><Icon name="music" /></button>
        )}
      </div>

      <div class="viewer-body" ref={bodyRef}>
        {pdf ? (
          <>
            <div style={{ flex: pane ? `0 0 ${ratio * 100}%` : '1', minHeight: 0, display: 'flex' }}>
              <PdfView key={pdf} fileId={pdf} initialPage={page} />
            </div>
            {pane && (
              <>
                <div class="divider" role="separator" aria-label="拖动调整分屏" onPointerDown={startDrag} />
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{paneContent}</div>
              </>
            )}
          </>
        ) : pane ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{paneContent}</div>
        ) : (
          <div class="empty" style="flex:1">
            <p>只打开了音频。</p>
            <div class="row wrap" style="justify-content:center">
              <button class="btn" onClick={() => setPicker('pdf')}>同屏打开题目 PDF</button>
              <button class="btn" onClick={() => setPane('sheet')}>打开答题卡</button>
            </div>
          </div>
        )}
      </div>

      {audioIds.length > 0 && <AudioPlayer ids={audioIds} />}

      <FloatingTimer onOpen={() => setTimerOpen(true)} />
      {timerOpen && <TimerSheet onClose={() => setTimerOpen(false)} />}
      {paneMenu && (
        <Modal title="下半屏" onClose={() => setPaneMenu(false)}>
          <button class="btn block" onClick={() => { setPaneMenu(false); setPane('sheet'); }}>答题卡（填答案、交卷判分）</button>
          <button
            class="btn block"
            onClick={async () => {
              setPaneMenu(false);
              const id = await createEssay({ task: 'T2', day, label: meta?.book != null && meta.test != null ? `剑${meta.book} Test ${meta.test}` : undefined });
              setPane('essay', { essay: id });
            }}
          >
            写作（新建一篇作文）
          </button>
          <button class="btn block" onClick={() => { setPaneMenu(false); setPicker('pdf2'); }}>第二个 PDF（如解析）</button>
        </Modal>
      )}
      {picker && (
        <FilePicker
          kind={picker === 'audio' ? 'audio' : 'pdf'}
          title={picker === 'pdf2' ? '选择要分屏打开的 PDF（如解析）' : picker === 'audio' ? '选择音频' : '选择 PDF'}
          exclude={pdf}
          onPick={(f) => {
            setPicker(null);
            if (picker === 'audio') params({ audio: f.id });
            else if (picker === 'pdf2') setPane('pdf2', { pdf2: f.id });
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
