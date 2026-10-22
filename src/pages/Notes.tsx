import { useMemo, useState } from 'preact/hooks';
import { BarList } from '../components/Charts';
import { MISTAKE_CAUSES } from '../data/constants';
import { del, put, uid } from '../db';
import { answer, causeLabel, causesFor, newRound, weekRange, weeklyCauseStats, type ReviewRound } from '../lib/notes';
import { dayNumber } from '../lib/plan';
import type { Mistake, Synonym } from '../types';
import { Icon, Modal, fmtDate, go, toast, useSettings, useStore } from '../ui';

export function Notes({ query }: { query: URLSearchParams }) {
  const tab = query.get('tab') === 'synonyms' ? 'synonyms' : 'mistakes';
  return (
    <>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mistakes'} class={tab === 'mistakes' ? 'active' : ''} onClick={() => go('/notes')}>错题本</button>
        <button role="tab" aria-selected={tab === 'synonyms'} class={tab === 'synonyms' ? 'active' : ''} onClick={() => go('/notes', { tab: 'synonyms' })}>词对本</button>
      </div>
      {tab === 'mistakes' ? <Mistakes /> : <Synonyms />}
    </>
  );
}

// ---------------- 错题本 ----------------
function Mistakes() {
  const list = useStore('mistakes');
  const settings = useSettings();
  const [skill, setSkill] = useState<'' | 'listening' | 'reading'>('');
  const [cause, setCause] = useState('');
  const [editing, setEditing] = useState<Partial<Mistake> | null>(null);

  if (!list || settings === undefined) return <div class="empty">加载中…</div>;
  const range = settings ? weekRange(settings.startDate, dayNumber(settings.startDate)) : weekRange('2000-01-01', 0);
  const stats = weeklyCauseStats(list, range.from, range.to);
  const shown = list
    .filter((m) => (!skill || m.skill === skill) && (!cause || m.cause === cause))
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <button class="btn primary block" onClick={() => setEditing({})}><Icon name="plus" /> 新增错题</button>

      <div class="card">
        <h3>{range.label}错因统计</h3>
        {stats.length === 0 ? (
          <div class="empty small">本周还没有错题</div>
        ) : (
          <>
            <div class="banner danger" style="margin-bottom:10px">本周重点：{stats[0].label}</div>
            <BarList items={stats.map((s) => ({ label: s.label, value: s.count }))} highlightFirst />
          </>
        )}
      </div>

      <div class="card stack">
        <div class="grid2">
          <select aria-label="按科目筛选" value={skill} onChange={(e) => setSkill((e.target as HTMLSelectElement).value as typeof skill)}>
            <option value="">全部科目</option>
            <option value="listening">听力</option>
            <option value="reading">阅读</option>
          </select>
          <select aria-label="按错因筛选" value={cause} onChange={(e) => setCause((e.target as HTMLSelectElement).value)}>
            <option value="">全部错因</option>
            {MISTAKE_CAUSES.map((c) => <option value={c.key}>{c.label}</option>)}
          </select>
        </div>
        {shown.length === 0 && <div class="empty small">没有记录</div>}
        <div class="list">
          {shown.map((m) => (
            <div class="item">
              <div class="row between">
                <div class="grow">
                  <div class="row wrap" style="gap:6px">
                    <span class={`tag ${m.skill}`}>{m.skill === 'listening' ? '听力' : '阅读'}</span>
                    <b>{m.source || '未填出处'}</b>
                  </div>
                  <div class="small">
                    我的：<span style="color:var(--danger)">{m.myAnswer || '—'}</span> · 正确：<span style="color:var(--ok)">{m.correctAnswer || '—'}</span>
                  </div>
                  <div class="small muted">{causeLabel(m.cause)} · {fmtDate(m.createdAt)}</div>
                  {m.note && <div class="small">{m.note}</div>}
                </div>
                <div class="row" style="gap:0">
                  <button class="iconbtn" aria-label="编辑" onClick={() => setEditing(m)}><Icon name="edit" /></button>
                  <button class="iconbtn" aria-label="删除" onClick={() => confirm('删除这条错题？') && del('mistakes', m.id)}><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && <MistakeForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MistakeForm({ initial, onClose }: { initial: Partial<Mistake>; onClose: () => void }) {
  const [f, setF] = useState({
    source: initial.source ?? '',
    skill: initial.skill ?? ('listening' as 'listening' | 'reading'),
    myAnswer: initial.myAnswer ?? '',
    correctAnswer: initial.correctAnswer ?? '',
    cause: initial.cause ?? '',
    note: initial.note ?? '',
  });
  const set = (k: keyof typeof f) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF((p) => ({ ...p, [k]: v }));
  };
  const options = causesFor(f.skill);
  const causeOk = options.some((c) => c.key === f.cause);

  const save = async () => {
    if (!causeOk) return toast('请选择错因');
    await put('mistakes', {
      id: initial.id ?? uid(),
      createdAt: initial.createdAt ?? Date.now(),
      source: f.source.trim(),
      skill: f.skill,
      myAnswer: f.myAnswer.trim(),
      correctAnswer: f.correctAnswer.trim(),
      cause: f.cause,
      note: f.note.trim() || undefined,
    });
    toast('已保存');
    onClose();
  };

  return (
    <Modal title={initial.id ? '编辑错题' : '新增错题'} onClose={onClose}>
      <label class="field"><span>出处</span><input type="text" placeholder="如 剑15 T2 S1 Q4" value={f.source} onInput={set('source')} /></label>
      <div class="tabs">
        {(['listening', 'reading'] as const).map((s) => (
          <button class={f.skill === s ? 'active' : ''} onClick={() => setF((p) => ({ ...p, skill: s }))}>{s === 'listening' ? '听力' : '阅读'}</button>
        ))}
      </div>
      <div class="grid2">
        <label class="field"><span>我的答案</span><input type="text" value={f.myAnswer} onInput={set('myAnswer')} /></label>
        <label class="field"><span>正确答案</span><input type="text" value={f.correctAnswer} onInput={set('correctAnswer')} /></label>
      </div>
      <label class="field">
        <span>错因</span>
        <select value={causeOk ? f.cause : ''} onChange={set('cause')}>
          <option value="">选择错因</option>
          {options.map((c) => <option value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <label class="field"><span>备注</span><textarea value={f.note} onInput={set('note')} /></label>
      <button class="btn primary block" onClick={save}>保存</button>
    </Modal>
  );
}

// ---------------- 词对本 ----------------
function Synonyms() {
  const list = useStore('synonyms');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Synonym> | null>(null);
  const [reviewing, setReviewing] = useState(false);

  if (!list) return <div class="empty">加载中…</div>;
  if (reviewing) return <Review cards={list} onExit={() => setReviewing(false)} />;

  const kw = q.trim().toLowerCase();
  const shown = list
    .filter((s) => !kw || [s.question, s.original, s.source ?? ''].some((t) => t.toLowerCase().includes(kw)))
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <div class="row">
        <button class="btn primary grow" onClick={() => setEditing({})}><Icon name="plus" /> 新增词对</button>
        <button class="btn grow" disabled={list.length === 0} onClick={() => setReviewing(true)}>复习（{list.length}）</button>
      </div>
      <div class="card stack">
        <input type="search" placeholder="搜索题目说法、原文说法或出处" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {shown.length === 0 && <div class="empty small">{list.length ? '没有匹配的词对' : '还没有词对'}</div>}
        <div class="list">
          {shown.map((s) => (
            <div class="item row between">
              <div class="grow">
                <div><b>{s.question}</b> <span class="muted">→</span> {s.original}</div>
                <div class="small muted">
                  {s.source && `${s.source} · `}复习 {s.reviewCount} 次
                </div>
              </div>
              <div class="row" style="gap:0">
                <button class="iconbtn" aria-label="编辑" onClick={() => setEditing(s)}><Icon name="edit" /></button>
                <button class="iconbtn" aria-label="删除" onClick={() => confirm('删除这个词对？') && del('synonyms', s.id)}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && <SynonymForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SynonymForm({ initial, onClose }: { initial: Partial<Synonym>; onClose: () => void }) {
  const [f, setF] = useState({ question: initial.question ?? '', original: initial.original ?? '', source: initial.source ?? '' });
  const set = (k: keyof typeof f) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF((p) => ({ ...p, [k]: v }));
  };
  const save = async (again: boolean) => {
    if (!f.question.trim() || !f.original.trim()) return toast('请填写题目说法和原文说法');
    await put('synonyms', {
      id: initial.id ?? uid(),
      createdAt: initial.createdAt ?? Date.now(),
      reviewCount: initial.reviewCount ?? 0,
      lastReviewedAt: initial.lastReviewedAt,
      question: f.question.trim(),
      original: f.original.trim(),
      source: f.source.trim() || undefined,
    });
    toast('已保存');
    if (again) setF({ question: '', original: '', source: f.source });
    else onClose();
  };
  return (
    <Modal title={initial.id ? '编辑词对' : '新增词对'} onClose={onClose}>
      <label class="field"><span>题目说法</span><input type="text" value={f.question} onInput={set('question')} /></label>
      <label class="field"><span>原文说法</span><input type="text" value={f.original} onInput={set('original')} /></label>
      <label class="field"><span>出处</span><input type="text" placeholder="如 剑16 T1 P2" value={f.source} onInput={set('source')} /></label>
      <div class="row">
        {!initial.id && <button class="btn grow" onClick={() => save(true)}>保存并继续</button>}
        <button class="btn primary grow" onClick={() => save(false)}>保存</button>
      </div>
    </Modal>
  );
}

function Review({ cards, onExit }: { cards: Synonym[]; onExit: () => void }) {
  // 一轮开始时固定卡片快照，避免复习中写回数据导致顺序变化
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), []);
  const [round, setRound] = useState<ReviewRound>(() => newRound(cards));
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ ok: 0, miss: 0 });

  const id = round.queue[round.pos];
  const card = id ? byId.get(id) : undefined;

  const mark = async (remembered: boolean) => {
    if (!card) return;
    const latest = byId.get(card.id)!;
    const updated = { ...latest, reviewCount: latest.reviewCount + 1, lastReviewedAt: Date.now() };
    byId.set(card.id, updated);
    await put('synonyms', updated);
    setStats((s) => (remembered ? { ...s, ok: s.ok + 1 } : { ...s, miss: s.miss + 1 }));
    setRound(answer(round, remembered));
    setFlipped(false);
  };

  if (!card) {
    return (
      <div class="card stack" style="text-align:center">
        <h3>本轮复习完成</h3>
        <div class="muted">记住了 {stats.ok} 次 · 没记住 {stats.miss} 次</div>
        <div class="row">
          <button class="btn grow" onClick={onExit}>返回列表</button>
          <button class="btn primary grow" onClick={() => { setRound(newRound([...byId.values()])); setStats({ ok: 0, miss: 0 }); }}>再来一轮</button>
        </div>
      </div>
    );
  }

  const isRepeat = round.pos >= cards.length;
  return (
    <>
      <div class="row between">
        <button class="btn small" onClick={onExit}>结束复习</button>
        <span class="small muted">{round.pos + 1} / {round.queue.length}{isRepeat && ' · 再看一遍'}</span>
      </div>
      <div class="card flashcard" role="button" tabIndex={0} onClick={() => setFlipped(!flipped)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setFlipped(!flipped)}>
        <div class="small muted">题目说法</div>
        <div><b>{card.question}</b></div>
        {flipped ? (
          <>
            <hr style="width:60%" />
            <div class="small muted">原文说法</div>
            <div>{card.original}</div>
            {card.source && <div class="small muted">{card.source}</div>}
          </>
        ) : (
          <div class="small muted">点击翻面</div>
        )}
      </div>
      <div class="row">
        <button class="btn grow" style="min-height:52px" onClick={() => mark(false)}>没记住</button>
        <button class="btn primary grow" style="min-height:52px" onClick={() => mark(true)}>记住了</button>
      </div>
    </>
  );
}
