import { useState } from 'preact/hooks';
import { LineChart, type Series } from '../components/Charts';
import { del, put, uid } from '../db';
import { dayNumber, inPlan } from '../lib/plan';
import { fmtBand, summarize } from '../lib/score';
import type { Score } from '../types';
import { Icon, Modal, go, numOrUndef, toast, useSettings, useStore } from '../ui';

export function Scores({ query }: { query: URLSearchParams }) {
  const scores = useStore('scores');
  const settings = useSettings();
  const [editing, setEditing] = useState<Partial<Score> | null>(() =>
    query.get('new') ? { day: numOrUndef(query.get('day') ?? ''), label: query.get('label') ?? '' } : null,
  );

  if (!scores || settings === undefined) return <div class="empty">加载中…</div>;
  const current = settings ? dayNumber(settings.startDate) : 1;
  const sorted = [...scores].sort((a, b) => a.day - b.day || a.createdAt - b.createdAt);
  const latest = [...scores].sort((a, b) => b.day - a.day || b.createdAt - a.createdAt);

  const series: Series[] = [
    { name: '听力', color: 'var(--c-listening)', points: [] },
    { name: '阅读', color: 'var(--c-reading)', points: [] },
    { name: '写作', color: 'var(--c-writing)', points: [] },
    { name: '口语', color: 'var(--c-speaking)', points: [] },
    { name: '总分', color: 'var(--c-overall)', points: [], bold: true },
  ];
  for (const s of sorted) {
    const m = summarize(s);
    [m.listening, m.reading, m.writing, m.speaking, m.overall].forEach((v, i) => v != null && series[i].points.push({ x: s.day, y: v }));
  }

  const close = () => {
    setEditing(null);
    if (query.get('new')) go('/scores');
  };

  return (
    <>
      <button class="btn primary block" onClick={() => setEditing({ day: inPlan(current) ? current : undefined })}>
        <Icon name="plus" /> 新增分数
      </button>
      <div class="card">
        <h3>进步曲线</h3>
        <LineChart series={series} />
      </div>
      <div class="card">
        <h3>全部记录</h3>
        {latest.length === 0 && <div class="empty small">还没有记录</div>}
        <div class="list">
          {latest.map((s) => {
            const m = summarize(s);
            return (
              <div class="item">
                <div class="row between">
                  <b>第 {s.day} 天 {s.label && <span class="muted">· {s.label}</span>}</b>
                  <div class="row" style="gap:0">
                    <button class="iconbtn" aria-label="编辑" onClick={() => setEditing(s)}><Icon name="edit" /></button>
                    <button class="iconbtn" aria-label="删除" onClick={() => confirm('删除这条分数记录？') && del('scores', s.id)}><Icon name="trash" /></button>
                  </div>
                </div>
                <div class="small mono">
                  听 {fmtBand(m.listening)}{s.listeningRaw != null && <span class="muted">（{s.listeningRaw}）</span>}
                  {' · '}阅 {fmtBand(m.reading)}{s.readingRaw != null && <span class="muted">（{s.readingRaw}）</span>}
                  {' · '}写 {fmtBand(m.writing)} · 说 {fmtBand(m.speaking)}
                </div>
                <div class="small">
                  {m.complete ? (
                    <>总和 <b>{m.sum}</b> · 总分 <b>{fmtBand(m.overall)}</b> · {m.gap! > 0 ? <span style="color:var(--warn)">离 29 还差 {m.gap} 分</span> : <span style="color:var(--ok)">已达到 29</span>}</>
                  ) : (
                    <span class="muted">已填科目合计 {m.sum}（四科都填写后显示总分）</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editing && <ScoreForm initial={editing} onClose={close} />}
    </>
  );
}

function ScoreForm({ initial, onClose }: { initial: Partial<Score>; onClose: () => void }) {
  const [f, setF] = useState({
    day: initial.day?.toString() ?? '',
    label: initial.label ?? '',
    l: initial.listeningRaw?.toString() ?? '',
    r: initial.readingRaw?.toString() ?? '',
    w: initial.writing?.toString() ?? '',
    s: initial.speaking?.toString() ?? '',
  });
  const set = (k: keyof typeof f) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF((p) => ({ ...p, [k]: v }));
  };
  const rec = {
    listeningRaw: numOrUndef(f.l),
    readingRaw: numOrUndef(f.r),
    writing: numOrUndef(f.w),
    speaking: numOrUndef(f.s),
  };
  const m = summarize(rec);

  const errors: string[] = [];
  const day = Number(f.day);
  if (!(Number.isInteger(day) && day >= 1 && day <= 60)) errors.push('请选择第几天');
  for (const [k, v] of [['听力', rec.listeningRaw], ['阅读', rec.readingRaw]] as const)
    if (v != null && !(Number.isInteger(v) && v >= 0 && v <= 40)) errors.push(`${k}答对数应为 0–40 的整数`);
  for (const [k, v] of [['写作', rec.writing], ['口语', rec.speaking]] as const)
    if (v != null && !(v >= 0 && v <= 9 && (v * 2) % 1 === 0)) errors.push(`${k}分数应为 0–9，步长 0.5`);

  const save = async () => {
    if (errors.length) return toast(errors[0]);
    await put('scores', {
      id: initial.id ?? uid(),
      createdAt: initial.createdAt ?? Date.now(),
      day,
      label: f.label.trim(),
      ...rec,
    });
    toast('已保存');
    onClose();
  };

  return (
    <Modal title={initial.id ? '编辑分数' : '新增分数'} onClose={onClose}>
      <div class="grid2">
        <label class="field">
          <span>第几天</span>
          <select value={f.day} onChange={set('day')}>
            <option value="">选择</option>
            {Array.from({ length: 28 }, (_, i) => <option value={i + 1}>第 {i + 1} 天</option>)}
          </select>
        </label>
        <label class="field">
          <span>套题</span>
          <input type="text" placeholder="如 剑19 Test 1" value={f.label} onInput={set('label')} />
        </label>
        <label class="field">
          <span>听力答对数（0–40）→ {fmtBand(m.listening)}</span>
          <input type="number" inputMode="numeric" min="0" max="40" value={f.l} onInput={set('l')} />
        </label>
        <label class="field">
          <span>阅读答对数（0–40）→ {fmtBand(m.reading)}</span>
          <input type="number" inputMode="numeric" min="0" max="40" value={f.r} onInput={set('r')} />
        </label>
        <label class="field">
          <span>写作（0–9）</span>
          <input type="number" inputMode="decimal" min="0" max="9" step="0.5" value={f.w} onInput={set('w')} />
        </label>
        <label class="field">
          <span>口语（0–9）</span>
          <input type="number" inputMode="decimal" min="0" max="9" step="0.5" value={f.s} onInput={set('s')} />
        </label>
      </div>
      <div class="small muted">提示：AI 批改的写作、口语分数通常偏高约 0.5。</div>
      <div class="banner info mono">
        四科总和 <b>{m.sum}</b>
        {m.complete ? (
          <> · 总分 <b>{fmtBand(m.overall)}</b> · {m.gap! > 0 ? `离总和 29 还差 ${m.gap} 分` : '已达到 29'}</>
        ) : (
          ' · 四科都填写后显示总分'
        )}
      </div>
      <button class="btn primary block" onClick={save}>保存</button>
    </Modal>
  );
}
