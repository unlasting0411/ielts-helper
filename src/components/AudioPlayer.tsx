import { useEffect, useRef, useState } from 'preact/hooks';
import { getFileBlob, getFileMeta, updateFileMeta } from '../db';
import type { FileMeta } from '../types';
import { Icon } from '../ui';

const SPEEDS = [0.75, 0.9, 1, 1.25, 1.5];

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '--:--';
  const s = Math.floor(t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function AudioPlayer({ ids }: { ids: string[] }) {
  const [index, setIndex] = useState(0);
  const [metas, setMetas] = useState<FileMeta[]>([]);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(NaN);
  const [rate, setRate] = useState(1);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const ab = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });
  ab.current = { a, b };

  useEffect(() => {
    Promise.all(ids.map(getFileMeta)).then((ms) => setMetas(ms.filter((m): m is FileMeta => !!m)));
  }, [ids.join(',')]);

  const meta = metas[index];

  // 加载当前音轨
  useEffect(() => {
    if (!meta) return;
    let url: string | null = null;
    let alive = true;
    setError('');
    setA(null);
    setB(null);
    getFileBlob(meta.id).then((blob) => {
      if (!alive) return;
      if (!blob) { setError('音频文件不存在'); return; }
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [meta?.id]);

  // 锁屏/通知栏控制
  useEffect(() => {
    if (!meta || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: meta.name, artist: '雅思学习助手' });
    const el = audio.current!;
    const set = (k: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(k, fn); } catch { /* 不支持 */ }
    };
    set('play', () => el.play());
    set('pause', () => el.pause());
    set('seekbackward', () => seek(-5));
    set('seekforward', () => seek(5));
  }, [meta?.id]);

  const save = (force = false) => {
    const el = audio.current;
    if (!el || !meta) return;
    const now = Date.now();
    if (!force && now - lastSaved.current < 5000) return;
    lastSaved.current = now;
    void updateFileMeta(meta.id, { lastTime: el.currentTime });
  };

  useEffect(() => () => save(true), [meta?.id]);

  // A-B 循环：timeupdate 约 250ms 一次，循环时额外每 50ms 检查，回跳更准
  useEffect(() => {
    if (a == null || b == null) return;
    const id = setInterval(() => {
      const el = audio.current;
      if (el && !el.paused && el.currentTime >= b) el.currentTime = a;
    }, 50);
    return () => clearInterval(id);
  }, [a, b]);

  const seek = (delta: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
  };

  const toggleAB = () => {
    const el = audio.current;
    if (!el) return;
    if (a == null) setA(el.currentTime);
    else if (b == null) {
      const t = el.currentTime;
      if (t > a + 0.5) setB(t);
      else { setB(a); setA(t); }
      el.currentTime = Math.min(a, t);
    } else { setA(null); setB(null); }
  };

  return (
    <div class="player">
      <audio
        ref={audio}
        src={src ?? undefined}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDur(el.duration);
          el.playbackRate = rate;
          if (meta?.lastTime && meta.lastTime < el.duration - 1) el.currentTime = meta.lastTime;
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const { a: A, b: B } = ab.current;
          if (A != null && B != null && el.currentTime >= B) el.currentTime = A;
          setTime(el.currentTime);
          save();
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); save(true); }}
        onEnded={() => {
          setPlaying(false);
          save(true);
          if (index < metas.length - 1) setIndex(index + 1);
        }}
        onError={() => setError('这个音频格式无法播放')}
      />
      {metas.length > 1 && (
        <div class="chips">
          {metas.map((m, i) => (
            <button class={i === index ? 'active' : ''} onClick={() => { save(true); setIndex(i); }}>
              {m.section != null ? `Section ${m.section}` : `音轨 ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <div class="row small">
        <span class="mono">{fmt(time)}</span>
        <span class="grow ellipsis muted" style="text-align:center">{error || meta?.name || '加载中…'}</span>
        <span class="mono">{fmt(dur)}</span>
      </div>
      <input
        type="range"
        min="0"
        max={Number.isFinite(dur) ? dur : 0}
        step="0.1"
        value={time}
        aria-label="播放进度"
        onInput={(e) => {
          const t = Number((e.target as HTMLInputElement).value);
          if (audio.current) audio.current.currentTime = t;
          setTime(t);
        }}
      />
      <div class="row" style="justify-content:space-between">
        <button class="big" aria-label="后退 5 秒" onClick={() => seek(-5)}>-5s</button>
        <button
          class={`big ${a != null ? 'play' : ''}`}
          aria-label="A-B 循环"
          onClick={toggleAB}
          style={a != null && b == null ? { background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' } : undefined}
        >
          {a == null ? 'A-B' : b == null ? 'B?' : 'A-B✓'}
        </button>
        <button class="big play" aria-label={playing ? '暂停' : '播放'} onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button class="big" aria-label="前进 5 秒" onClick={() => seek(5)}>+5s</button>
      </div>
      {a != null && (
        <div class="small muted" style="text-align:center">
          A {fmt(a)}{b != null ? ` → B ${fmt(b)}，循环中（再点一次取消）` : '，再点一次设 B 点'}
        </div>
      )}
      <div class="speeds" role="group" aria-label="播放速度">
        {SPEEDS.map((s) => (
          <button
            class={rate === s ? 'active' : ''}
            onClick={() => {
              setRate(s);
              if (audio.current) audio.current.playbackRate = s;
            }}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
