import { useEffect, useRef, useState } from 'preact/hooks';
import { deleteRecording, getRecordingBlob, put, saveRecording, todayISO, uid } from '../../db';
import { fmtClock } from '../../lib/timer';
import type { Recording, SpeakingPart } from '../../types';
import { fmtBytes, fmtDate, toast, useStore } from '../../ui';

const PARTS: { key: SpeakingPart; label: string }[] = [
  { key: 'P1', label: 'Part 1' },
  { key: 'P2', label: 'Part 2' },
  { key: 'P3', label: 'Part 3' },
  { key: 'full', label: '完整模拟' },
];
const PART_LABEL: Record<SpeakingPart, string> = { P1: 'Part 1', P2: 'Part 2', P3: 'Part 3', full: '完整模拟' };
const PREP_SEC = 60;
const P2_SEC = 120;
const MAX_SEC = 20 * 60;

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}
const extOf = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

type Phase = { kind: 'idle' } | { kind: 'prep'; endsAt: number } | { kind: 'rec'; startedAt: number; limitSec: number };

export function Speaking({ initialPart, day }: { initialPart?: SpeakingPart; day?: number }) {
  const [part, setPart] = useState<SpeakingPart>(initialPart ?? 'P1');
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [, tick] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const starting = useRef(false);
  const list = useStore('recordings');

  // 每 200ms 刷新倒计时；到点自动切换阶段
  useEffect(() => {
    if (phase.kind === 'idle') return;
    const h = setInterval(() => {
      const now = Date.now();
      if (phase.kind === 'prep' && now >= phase.endsAt) {
        navigator.vibrate?.(400);
        void startRecording(P2_SEC);
      } else if (phase.kind === 'rec' && now - phase.startedAt >= phase.limitSec * 1000) {
        navigator.vibrate?.([300, 150, 300]);
        stopRecording();
      }
      tick((n) => n + 1);
    }, 200);
    return () => clearInterval(h);
  }, [phase]);

  // 离开页面时停止并保存
  useEffect(() => () => { stopRecording(); releaseWake(); }, []);

  async function holdWake() {
    try { if ('wakeLock' in navigator && !wake.current) wake.current = await navigator.wakeLock.request('screen'); } catch { /* 忽略 */ }
  }
  function releaseWake() {
    wake.current?.release().catch(() => {});
    wake.current = null;
  }

  async function startRecording(limitSec: number) {
    if (starting.current || rec.current) return;
    starting.current = true;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const durationSec = Math.round((Date.now() - startedAt) / 1000);
        if (durationSec < 1 || blob.size === 0) return;
        const meta: Recording = { id: uid(), part, topic: topic.trim() || undefined, day, durationSec, mime: type, size: blob.size, createdAt: Date.now() };
        try {
          await saveRecording(meta, blob);
          toast(`已保存录音（${fmtClock(durationSec)}）`);
        } catch {
          toast('录音保存失败：存储空间可能不足');
        }
      };
      mr.start(1000);
      rec.current = { mr, stream, chunks, startedAt };
      setPhase({ kind: 'rec', startedAt, limitSec });
      void holdWake();
    } catch (e) {
      setPhase({ kind: 'idle' });
      releaseWake();
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' ? '没有麦克风权限。请在浏览器的网站设置里允许使用麦克风。' : `无法录音：${e instanceof Error ? e.message : e}`);
    } finally {
      starting.current = false;
    }
  }

  function stopRecording() {
    const r = rec.current;
    rec.current = null;
    if (r && r.mr.state !== 'inactive') r.mr.stop();
    setPhase({ kind: 'idle' });
    releaseWake();
  }

  const now = Date.now();
  const busy = phase.kind !== 'idle';

  return (
    <>
      <div class="card stack">
        <div class="chips" role="group" aria-label="选择部分">
          {PARTS.map((p) => (
            <button class={part === p.key ? 'active' : ''} disabled={busy} onClick={() => setPart(p.key)}>{p.label}</button>
          ))}
        </div>
        <input type="text" placeholder="话题或题目（可选），如 Describe a book you read" value={topic} disabled={busy} onInput={(e) => setTopic((e.target as HTMLInputElement).value)} />

        <div style="text-align:center" class="stack">
          {phase.kind === 'prep' && (
            <>
              <div class="small muted">准备时间（可在纸上写要点）</div>
              <div class="clock" style="font-size:64px">{fmtClock((phase.endsAt - now) / 1000)}</div>
              <div class="small muted">结束后自动开始录音 2 分钟</div>
            </>
          )}
          {phase.kind === 'rec' && (
            <>
              <div class="small"><span class="rec-dot" /> 录音中</div>
              <div class="clock" style="font-size:64px">
                {part === 'P2' ? fmtClock(phase.limitSec - (now - phase.startedAt) / 1000) : fmtClock((now - phase.startedAt) / 1000)}
              </div>
              {part === 'P2' && <div class="small muted">2 分钟到会自动停止，和考试一样</div>}
            </>
          )}
          <div class="row" style="justify-content:center">
            {phase.kind === 'idle' ? (
              <button
                class="rec-btn"
                onClick={() => {
                  if (part === 'P2') {
                    setPhase({ kind: 'prep', endsAt: Date.now() + PREP_SEC * 1000 });
                    void holdWake();
                  } else void startRecording(MAX_SEC);
                }}
              >
                {part === 'P2' ? '开始' : '录音'}
              </button>
            ) : phase.kind === 'prep' ? (
              <button class="rec-btn" onClick={() => startRecording(P2_SEC)}>直接说</button>
            ) : (
              <button class="rec-btn stop" onClick={stopRecording}>停止</button>
            )}
          </div>
          {phase.kind === 'prep' && <button class="btn small ghost" onClick={() => { setPhase({ kind: 'idle' }); releaseWake(); }}>取消</button>}
          {error && <div class="banner danger">{error}</div>}
          {part === 'P2' && phase.kind === 'idle' && <div class="small muted">Part 2：准备 1 分钟，然后自动录 2 分钟。</div>}
        </div>
      </div>

      <div class="card">
        <h3>录音（{list?.length ?? 0}）</h3>
        <div class="small muted" style="margin-bottom:6px">只保存在本机。听回放找问题，或分享给转文字工具后发给 Claude 评估。</div>
        {list && list.length === 0 && <div class="empty small">还没有录音</div>}
        <div class="list">
          {[...(list ?? [])].sort((a, b) => b.createdAt - a.createdAt).map((r) => <RecordingRow key={r.id} r={r} />)}
        </div>
      </div>
    </>
  );
}

function RecordingRow({ r }: { r: Recording }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState(r.note ?? '');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const fileName = () => {
    const d = new Date(r.createdAt);
    return `口语-${PART_LABEL[r.part].replace(' ', '')}-${todayISO(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.${extOf(r.mime)}`;
  };
  const load = async () => {
    if (url) return url;
    const blob = await getRecordingBlob(r.id);
    if (!blob) { toast('录音文件不存在'); return null; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return u;
  };
  const share = async () => {
    const blob = await getRecordingBlob(r.id);
    if (!blob) return;
    const file = new File([blob], fileName(), { type: r.mime });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: fileName() }); } catch { /* 用户取消 */ }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  };
  return (
    <div class="item stack" style="gap:6px">
      <div class="row between">
        <div class="grow" style="min-width:0">
          <b>{PART_LABEL[r.part]}</b> <span class="small muted">· {fmtClock(r.durationSec)} · {fmtBytes(r.size)}</span>
          {r.topic && <div class="small ellipsis">{r.topic}</div>}
          <div class="small muted">{fmtDate(r.createdAt)}{r.day ? ` · 第 ${r.day} 天` : ''}</div>
        </div>
        <button class="btn small" onClick={share}>分享</button>
        <button class="btn small danger" onClick={async () => { if (confirm('删除这段录音？')) await deleteRecording(r.id); }}>删除</button>
      </div>
      {url ? <audio controls src={url} style="width:100%" /> : <button class="btn small" onClick={load}>▶ 播放</button>}
      <input
        type="text"
        placeholder="备注（如 Claude 给的分数、要改的问题）"
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        onBlur={() => note !== (r.note ?? '') && put('recordings', { ...r, note: note.trim() || undefined })}
      />
    </div>
  );
}
