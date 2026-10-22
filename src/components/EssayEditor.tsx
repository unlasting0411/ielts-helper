import { useEffect, useRef, useState } from 'preact/hooks';
import { TIMER_PRESETS } from '../data/constants';
import { del, getOne, put, uid } from '../db';
import { fmtClock } from '../lib/timer';
import { MIN_WORDS, countWords, reviewRequest } from '../lib/writing';
import { timer, useTimer } from '../timerStore';
import type { Essay } from '../types';
import { fmtDate, numOrUndef, toast } from '../ui';

export async function createEssay(init: Partial<Essay> & Pick<Essay, 'task'>): Promise<string> {
  const now = Date.now();
  const e: Essay = { id: uid(), prompt: '', text: '', createdAt: now, updatedAt: now, ...init };
  await put('essays', e);
  return e.id;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 退回到选中文本复制
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function EssayEditor({ id, onOpen, onDeleted }: { id: string; onOpen: (id: string) => void; onDeleted?: () => void }) {
  const [e, setE] = useState<Essay | null>(null);
  const [prev, setPrev] = useState<Essay | null>(null);
  const dirty = useRef(false);
  const t = useTimer();

  useEffect(() => {
    dirty.current = false;
    getOne('essays', id).then((x) => {
      setE(x ?? null);
      if (x?.rewriteOf) getOne('essays', x.rewriteOf).then((p) => setPrev(p ?? null));
      else setPrev(null);
    });
  }, [id]);

  // 自动保存
  useEffect(() => {
    if (!e || !dirty.current) return;
    const h = setTimeout(() => put('essays', { ...e, updatedAt: Date.now() }), 600);
    return () => clearTimeout(h);
  }, [e]);

  if (!e) return <div class="empty small">加载中…</div>;
  const patch = (p: Partial<Essay>) => {
    dirty.current = true;
    setE((cur) => (cur ? { ...cur, ...p } : cur));
  };
  const words = countWords(e.text);
  const min = MIN_WORDS[e.task];
  const presetKey = e.task === 'T1' ? 'writingT1' : 'writingT2';
  const timerRunning = t && !t.v.done && t.stored.state.presetKey.startsWith('writing');

  return (
    <div class="stack" style="gap:10px">
      <div class="row wrap" style="gap:6px">
        <div class="tabs" style="flex:none">
          {(['T1', 'T2'] as const).map((k) => (
            <button class={e.task === k ? 'active' : ''} style="min-width:72px" onClick={() => patch({ task: k })}>Task {k.slice(1)}</button>
          ))}
        </div>
        <input type="text" class="grow" style="min-width:120px" placeholder="出处，如 剑15 Test 1" value={e.label ?? ''} onInput={(ev) => patch({ label: (ev.target as HTMLInputElement).value })} />
      </div>

      <details open={!e.prompt}>
        <summary class="small" style="cursor:pointer;min-height:36px;display:flex;align-items:center">题目{e.prompt ? `：${e.prompt.slice(0, 30)}${e.prompt.length > 30 ? '…' : ''}` : '（抄写或粘贴题目，方便发给 Claude）'}</summary>
        <textarea value={e.prompt} placeholder="题目原文" onInput={(ev) => patch({ prompt: (ev.target as HTMLTextAreaElement).value })} />
      </details>

      {prev && (
        <details>
          <summary class="small" style="cursor:pointer;min-height:36px;display:flex;align-items:center">上一版（{countWords(prev.text)} 词{prev.band != null ? ` · ${prev.band.toFixed(1)} 分` : ''}）</summary>
          <div class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:8px;border-radius:8px">{prev.text || '（空）'}</div>
          {prev.feedback && <div class="small muted" style="white-space:pre-wrap;margin-top:6px">批改要点：{prev.feedback}</div>}
        </details>
      )}

      <div class="row between small">
        <span style={{ color: words >= min ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>{words} 词 / 至少 {min}</span>
        {timerRunning ? (
          <span class="mono">⏱ {fmtClock(t!.v.totalRemainingSec)}</span>
        ) : (
          <button class="btn small" onClick={() => { timer.start(presetKey, { day: e.day, label: e.label }); toast(`已开始：${TIMER_PRESETS[presetKey].label}`); }}>
            开始计时 {TIMER_PRESETS[presetKey].segments[0].sec / 60} 分钟
          </button>
        )}
      </div>
      <textarea
        class="essay-text"
        lang="en"
        spellcheck={false}
        autocapitalize="sentences"
        placeholder="在这里写作文（考试不能用拼写检查，这里也关掉了）"
        value={e.text}
        onInput={(ev) => patch({ text: (ev.target as HTMLTextAreaElement).value })}
      />

      <button
        class="btn primary block"
        disabled={!e.text.trim()}
        onClick={async () => {
          const ok = await copyText(reviewRequest(e));
          toast(ok ? '已复制，去 Claude 粘贴发送' : '复制失败，请手动选中复制');
        }}
      >
        复制给 Claude 批改
      </button>

      <div class="card stack" style="padding:10px">
        <div class="row">
          <span class="small grow">批改得分</span>
          <select aria-label="批改得分" style="width:110px" value={e.band ?? ''} onChange={(ev) => patch({ band: numOrUndef((ev.target as HTMLSelectElement).value) })}>
            <option value="">未批改</option>
            {Array.from({ length: 11 }, (_, i) => 4 + i * 0.5).map((b) => <option value={b}>{b.toFixed(1)}</option>)}
          </select>
        </div>
        <textarea placeholder="批改要点（最影响分数的问题、下次怎么改）" value={e.feedback ?? ''} onInput={(ev) => patch({ feedback: (ev.target as HTMLTextAreaElement).value })} />
        <div class="small muted">AI 批改分数通常偏高约 0.5。</div>
      </div>

      <div class="row">
        <button
          class="btn grow"
          onClick={async () => {
            const nid = await createEssay({ task: e.task, label: e.label, prompt: e.prompt, day: e.day, rewriteOf: e.id });
            toast('已新建重写稿，上一版可在上方展开对照');
            onOpen(nid);
          }}
        >
          重写一篇
        </button>
        <button
          class="btn danger grow"
          onClick={async () => {
            if (!confirm('删除这篇作文？')) return;
            await del('essays', e.id);
            onDeleted?.();
          }}
        >
          删除
        </button>
      </div>
      <div class="small muted">自动保存 · 创建于 {fmtDate(e.createdAt)}</div>
    </div>
  );
}
