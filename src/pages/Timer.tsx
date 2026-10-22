import { TIMER_PRESETS } from '../data/constants';
import { fmtClock, totalSec } from '../lib/timer';
import { timer, useTimer } from '../timerStore';

export function TimerPage() {
  const t = useTimer();

  const choose = (key: string) => {
    if (timer.isActive() && t?.stored.state.presetKey !== key && !confirm('已有计时在进行，要替换成新的计时吗？')) return;
    timer.start(key);
  };

  return (
    <>
      <div class="preset-grid">
        {Object.entries(TIMER_PRESETS).map(([key, p]) => (
          <button class={`btn ${t?.stored.state.presetKey === key ? 'active' : ''}`} onClick={() => choose(key)}>
            <span>{p.label}</span>
            <span class="small muted">
              {p.segments.length > 1 ? p.segments.map((s) => `${s.name} ${s.sec / 60}′`).join(' → ') : `${totalSec(p) / 60} 分钟`}
            </span>
          </button>
        ))}
      </div>

      {t ? <Running /> : <div class="card empty">选一个预设开始计时</div>}
    </>
  );
}

function Running() {
  const t = useTimer()!;
  const { v, stored } = t;
  const multi = v.preset.segments.length > 1;
  return (
    <div class="card stack">
      <div class="row between">
        <b>{v.preset.label}</b>
        {multi && <span class="tag">{v.segIndex + 1}/{v.preset.segments.length} {v.segName}</span>}
      </div>
      <div class="clock" aria-live="off">{fmtClock(multi ? v.segRemainingSec : v.totalRemainingSec)}</div>
      {multi && <div class="small muted" style="text-align:center">全程剩余 {fmtClock(v.totalRemainingSec)}</div>}
      <div class="progressbar"><div style={{ width: `${(v.elapsedSec / v.totalSec) * 100}%` }} /></div>
      {t.lastAlert && <div class="banner warn" role="alert">{t.lastAlert}</div>}
      <div class="row">
        {v.done ? (
          <button class="btn primary grow" onClick={() => timer.start(stored.state.presetKey, stored.ctx)}>再来一次</button>
        ) : v.running ? (
          <button class="btn primary grow" onClick={() => timer.pause()}>暂停</button>
        ) : (
          <button class="btn primary grow" onClick={() => timer.resume()}>{v.elapsedSec > 0 ? '继续' : '开始'}</button>
        )}
        <button class="btn grow" onClick={() => (v.elapsedSec < 5 || confirm('重置当前计时？')) && timer.reset()}>重置</button>
      </div>
      {v.preset.alerts.length > 0 && (
        <div class="small muted">
          提醒：{v.preset.alerts.map((a) => fmtClock(a)).join('、')}（从开始算起）
        </div>
      )}
    </div>
  );
}
