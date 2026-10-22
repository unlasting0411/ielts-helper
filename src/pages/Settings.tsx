import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, clearAll, exportData, importData, put, todayISO, type ExportData } from '../db';
import { SKILLS, SKILL_NAME, targetsOf } from '../lib/adaptive';
import type { Settings } from '../types';
import { fmtBytes, toast, useSettings } from '../ui';

export function SettingsPage() {
  const s = useSettings();
  if (s === undefined) return <div class="empty">加载中…</div>;
  const cur: Settings = s ?? { ...DEFAULT_SETTINGS, startDate: todayISO() };
  const update = (patch: Partial<Settings>) => put('settings', { ...cur, ...patch });
  const targets = targetsOf(cur);

  return (
    <>
      <div class="card stack">
        <h3>计划</h3>
        <label class="field">
          <span>第 1 天日期</span>
          <input type="date" value={cur.startDate} onChange={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (v) update({ startDate: v });
          }} />
        </label>
        <label class="field">
          <span>考试日期</span>
          <input type="date" value={cur.examDate ?? ''} onChange={(e) => update({ examDate: (e.target as HTMLInputElement).value || undefined })} />
        </label>
        <label class="field">
          <span>考试形式</span>
          <select value={cur.examMode} onChange={(e) => update({ examMode: (e.target as HTMLSelectElement).value as Settings['examMode'] })}>
            <option value="computer">机考</option>
            <option value="paper">纸笔</option>
            <option value="undecided">未定</option>
          </select>
        </label>
        <div class="field">
          <span>每日时长</span>
          <div class="tabs">
            {([6, 3] as const).map((h) => (
              <button class={cur.dailyHours === h ? 'active' : ''} onClick={() => update({ dailyHours: h })}>{h} 小时</button>
            ))}
          </div>
        </div>
        <div class="field">
          <span>各科目标分（总和 {SKILLS.reduce((a, k) => a + targets[k], 0)}，需 ≥ 29）</span>
          <div class="grid2" style="grid-template-columns:repeat(4,1fr);gap:6px">
            {SKILLS.map((k) => (
              <label class="field">
                <span>{SKILL_NAME[k]}</span>
                <select value={targets[k]} onChange={(e) => update({ targets: { ...targets, [k]: Number((e.target as HTMLSelectElement).value) } })}>
                  {Array.from({ length: 11 }, (_, i) => 4 + i * 0.5).map((b) => <option value={b}>{b.toFixed(1)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        <label class="row">
          <input type="checkbox" class="check" checked={cur.adaptive !== false} onChange={(e) => update({ adaptive: (e.target as HTMLInputElement).checked })} />
          <span class="grow">
            按分数调整
            <div class="small muted">3 小时版里，写作和口语中离目标更远的一科每 3 天练 2 天；关闭则单双数天交替。</div>
          </span>
        </label>
        {!s && <button class="btn primary" onClick={() => put('settings', cur)}>保存设置</button>}
      </div>

      <Storage />
      <Backup />

      <div class="card stack">
        <h3>危险操作</h3>
        <button
          class="btn danger block"
          onClick={async () => {
            if (!confirm('清空所有数据？包括导入的文件、录音、作文、答案、分数、错题、词对和进度。')) return;
            if (!confirm('再确认一次：清空后无法恢复。建议先导出数据。')) return;
            await clearAll();
            toast('已清空所有数据');
          }}
        >
          清空所有数据
        </button>
      </div>
      <div class="small muted" style="text-align:center">数据只保存在本机浏览器中，不上传、不联网。</div>
    </>
  );
}

function Storage() {
  const [est, setEst] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const refresh = async () => {
    try { setEst(await navigator.storage.estimate()); } catch { setEst({}); }
    try { setPersisted(await navigator.storage.persisted()); } catch { setPersisted(null); }
  };
  useEffect(() => { refresh(); }, []);
  const pct = est?.usage != null && est.quota ? (est.usage / est.quota) * 100 : 0;
  return (
    <div class="card stack">
      <h3>存储空间</h3>
      <div class="row between small">
        <span>已用 {fmtBytes(est?.usage)}</span>
        <span class="muted">剩余 {est?.quota != null && est.usage != null ? fmtBytes(est.quota - est.usage) : '—'}</span>
      </div>
      <div class="progressbar"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <div class="row between">
        <span class="small">
          持久化存储：{persisted == null ? '不支持' : persisted ? <b style="color:var(--ok)">已开启</b> : <b style="color:var(--warn)">未开启</b>}
        </span>
        {!persisted && (
          <button
            class="btn small"
            onClick={async () => {
              const ok = await navigator.storage?.persist?.().catch(() => false);
              toast(ok ? '已开启持久化存储' : '浏览器未同意。添加到主屏幕后再试通常可以成功。');
              refresh();
            }}
          >
            申请
          </button>
        )}
      </div>
    </div>
  );
}

function Backup() {
  const doExport = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `雅思助手备份-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('已导出（不含导入的文件）');
  };
  const doImport = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ExportData;
      const n = await importData(data);
      toast(`已导入 ${n} 条记录`);
    } catch (err) {
      toast(`导入失败：${err instanceof Error ? err.message : '文件格式不对'}`);
    }
  };
  return (
    <div class="card stack">
      <h3>数据备份</h3>
      <div class="small muted">导出分数、错题、词对、进度、设置、录入的答案、答题记录和作文为一个 JSON 文件，用于换手机或备份。不包含导入的 PDF、音频和口语录音。</div>
      <div class="row">
        <button class="btn grow" onClick={doExport}>导出数据</button>
        <label class="btn grow">
          导入数据
          <input type="file" accept="application/json,.json" hidden onChange={doImport} />
        </label>
      </div>
    </div>
  );
}
