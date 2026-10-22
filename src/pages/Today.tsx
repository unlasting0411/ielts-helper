import { useMemo } from 'preact/hooks';
import { TIMER_PRESETS } from '../data/constants';
import { DEFAULT_SETTINGS, put, setTaskDone, todayISO } from '../db';
import { SKILL_LABEL, matchTask } from '../lib/matcher';
import { weekRange, weeklyCauseStats } from '../lib/notes';
import { dateOfDay, dayNumber, daysBetween, displayDay, inPlan, parseISO, weekDays, type DisplayTask } from '../lib/plan';
import { timer } from '../timerStore';
import type { FileMeta, Settings } from '../types';
import { Icon, go, toast, useSettings, useStore } from '../ui';

export function Today({ query }: { query: URLSearchParams }) {
  const settings = useSettings();
  const progress = useStore('progress');
  const files = useStore('files');
  const mistakes = useStore('mistakes');

  if (settings === undefined || !progress || !files || !mistakes) return <div class="empty">加载中…</div>;
  if (settings === null) return <Welcome />;

  const current = dayNumber(settings.startDate);
  const qd = Number(query.get('day'));
  const day = qd >= 1 && qd <= 28 ? qd : current;
  const doneSet = new Set(progress.filter((p) => p.done).map((p) => p.id));

  return (
    <>
      <Header settings={settings} current={current} doneSet={doneSet} />
      <DayNav day={day} current={current} startDate={settings.startDate} />
      {!inPlan(day) ? (
        <div class="card empty">
          {day < 1 ? `计划未开始，第 1 天是 ${settings.startDate}` : '计划已结束。可以在设置里把第 1 天改到新的日期。'}
          <div style="margin-top:12px" class="row wrap" >
            <button class="btn grow" onClick={() => go('/today', { day: 1 })}>查看第 1 天</button>
            <button class="btn grow" onClick={() => go('/settings')}>去设置</button>
          </div>
        </div>
      ) : (
        <DayView
          day={day}
          settings={settings}
          doneSet={doneSet}
          files={files}
          topCause={(() => {
            const r = weekRange(settings.startDate, day);
            return weeklyCauseStats(mistakes, r.from, r.to)[0]?.label;
          })()}
        />
      )}
    </>
  );
}

function Welcome() {
  return (
    <div class="card stack">
      <h2>开始一个月备考</h2>
      <p class="muted" style="margin:0">把今天设为第 1 天，之后可以在设置里修改日期、考试日期和每日时长。</p>
      <button
        class="btn primary block"
        onClick={() => put('settings', { ...DEFAULT_SETTINGS, startDate: todayISO() })}
      >
        今天是第 1 天
      </button>
      <button class="btn block" onClick={() => go('/settings')}>自己设置日期</button>
    </div>
  );
}

function Header({ settings, current, doneSet }: { settings: Settings; current: number; doneSet: Set<string> }) {
  const week = inPlan(current) ? Math.ceil(current / 7) : null;
  let total = 0;
  let done = 0;
  if (week) {
    for (const d of weekDays(week)) {
      const dd = displayDay(d, settings.dailyHours)!;
      for (const t of dd.tasks) {
        total++;
        if (doneSet.has(`${d}-${t.key}`)) done++;
      }
    }
  }
  const toExam = settings.examDate ? daysBetween(todayISO(), parseISO(settings.examDate)) : null;
  return (
    <div class="card row" style="justify-content:space-around;text-align:center">
      <div class="stat">
        <b>{inPlan(current) ? `第 ${current} 天` : current < 1 ? '未开始' : '已结束'}</b>
        <span>共 28 天</span>
      </div>
      <div class="stat">
        <b>{week ? `${Math.round((done / Math.max(1, total)) * 100)}%` : '—'}</b>
        <span>{week ? `第 ${week} 周完成率` : '本周完成率'}</span>
      </div>
      <div class="stat">
        <b>{toExam == null ? '—' : toExam >= 0 ? `${toExam} 天` : '已考'}</b>
        <span>{toExam == null ? '未设考试日期' : '距考试'}</span>
      </div>
    </div>
  );
}

function DayNav({ day, current, startDate }: { day: number; current: number; startDate: string }) {
  const clamp = (d: number) => Math.min(28, Math.max(1, d));
  const date = dateOfDay(startDate, day);
  return (
    <div class="row between">
      <button class="iconbtn" aria-label="前一天" disabled={day <= 1} onClick={() => go('/today', { day: clamp(day - 1) })}>
        <Icon name="left" />
      </button>
      <div style="text-align:center">
        <b>{inPlan(day) ? `第 ${day} 天` : '今天'}</b>
        <div class="small muted">
          {date.getMonth() + 1}月{date.getDate()}日 周{'日一二三四五六'[date.getDay()]}
          {inPlan(day) && day !== current && (
            <>
              {' · '}
              <a href="#/today">回到今天</a>
            </>
          )}
        </div>
      </div>
      <button class="iconbtn" aria-label="后一天" disabled={day >= 28 && inPlan(day)} onClick={() => go('/today', { day: clamp(inPlan(day) ? day + 1 : 1) })}>
        <Icon name="right" />
      </button>
    </div>
  );
}

function DayView(props: { day: number; settings: Settings; doneSet: Set<string>; files: FileMeta[]; topCause?: string }) {
  const { day, settings, doneSet, files } = props;
  const dd = useMemo(() => displayDay(day, settings.dailyHours)!, [day, settings.dailyHours]);
  return (
    <>
      {dd.isMock && <div class="banner warn">模考日：听、阅、写连续完成，中间不休息。</div>}
      {dd.type === 'taper' && <div class="banner info">考前调整期</div>}
      <div class="card">
        {dd.tasks.map((t) => (
          <TaskRow key={t.key} day={day} task={t} done={doneSet.has(`${day}-${t.key}`)} files={files} topCause={props.topCause} />
        ))}
      </div>
      {dd.notes && <div class="banner info">{dd.notes}</div>}
      {settings.dailyHours === 3 && <div class="small muted">当前为 3 小时版：写作和口语隔天交替（单数天写作、双数天口语）。</div>}
    </>
  );
}

function TaskRow({ day, task, done, files, topCause }: { day: number; task: DisplayTask; done: boolean; files: FileMeta[]; topCause?: string }) {
  const startable = task.skill !== 'vocab' && (task.ref || task.timer);
  const isCauseTask = task.key === 'X' && task.text.includes('错因专项');

  const onStart = () => {
    const timerKey = task.timer;
    const label = task.ref ? `剑${task.ref.book} Test ${task.ref.test}` : undefined;
    const startTimer = () => {
      if (!timerKey) return;
      if (timer.isActive() && !confirm('已有计时在进行，要替换成新的计时吗？')) return;
      timer.start(timerKey, { day, label });
      toast(`已开始：${TIMER_PRESETS[timerKey].label}`);
    };
    if (task.ref) {
      const m = matchTask(task.ref, files);
      if (!m.pdf && m.audios.length === 0) {
        toast(`未导入${m.missing}，去资料库导入`, { label: '去导入', run: () => go('/library') }, 6000);
        return;
      }
      startTimer();
      go('/view', {
        pdf: m.pdf?.id,
        page: m.page,
        audio: m.audios.map((a) => a.id).join(',') || undefined,
      });
      return;
    }
    startTimer();
    go('/timer');
  };

  return (
    <div class={`task ${done ? 'done' : ''}`} style="padding:4px 0">
      <label class="checkwrap">
        <input type="checkbox" class="check" checked={done} aria-label={`完成：${task.text}`} onChange={(e) => setTaskDone(day, task.key, (e.target as HTMLInputElement).checked)} />
      </label>
      <div class="task-text">
        <div class="row" style="gap:6px;margin-bottom:2px">
          <span class={`tag ${task.skill}`}>{SKILL_LABEL[task.skill]}</span>
          {task.timer && <span class="small muted">⏱ {TIMER_PRESETS[task.timer]?.label}</span>}
        </div>
        <div>{task.text}</div>
        {task.note3h && <div class="small" style="color:var(--warn)">{task.note3h}</div>}
        {isCauseTask && (
          <div class="small" style="color:var(--primary)">
            {topCause ? `本周最多的错因：${topCause}` : '本周还没有错题记录'}
          </div>
        )}
      </div>
      {startable && (
        <button class="btn small" style="margin-top:4px" onClick={onStart}>开始</button>
      )}
    </div>
  );
}
