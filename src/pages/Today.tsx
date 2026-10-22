import { useMemo } from 'preact/hooks';
import { createEssay } from '../components/EssayEditor';
import { TIMER_PRESETS } from '../data/constants';
import { DEFAULT_SETTINGS, put, setTaskDone, todayISO } from '../db';
import {
  CAUSE_ADVICE, SKILL_NAME, checkpoint14, currentBands, diagnose, gaps, suggestSpare, targetsOf, writingOrSpeaking,
  type Checkpoint,
} from '../lib/adaptive';
import { SKILL_LABEL, matchTask } from '../lib/matcher';
import { weekRange, weeklyCauseStats, type CauseCount } from '../lib/notes';
import { dateOfDay, dayNumber, daysBetween, displayDay, inPlan, parseISO, weekDays, type DisplayTask } from '../lib/plan';
import { timer } from '../timerStore';
import type { Attempt, FileMeta, Score, Settings, TaskRef } from '../types';
import { Icon, go, toast, useSettings, useStore } from '../ui';

export function Today({ query }: { query: URLSearchParams }) {
  const settings = useSettings();
  const progress = useStore('progress');
  const files = useStore('files');
  const mistakes = useStore('mistakes');
  const scores = useStore('scores');
  const attempts = useStore('attempts');

  if (settings === undefined || !progress || !files || !mistakes || !scores || !attempts) return <div class="empty">加载中…</div>;
  if (settings === null) return <Welcome />;

  const current = dayNumber(settings.startDate);
  const qd = Number(query.get('day'));
  const day = qd >= 1 && qd <= 28 ? qd : current;
  const doneSet = new Set(progress.filter((p) => p.done).map((p) => p.id));
  const targets = targetsOf(settings);
  const bands = currentBands(scores);
  const wsPick = (d: number) => writingOrSpeaking(d, bands, targets, settings.adaptive !== false);
  const range = weekRange(settings.startDate, inPlan(day) ? day : current);
  const causeStats = weeklyCauseStats(mistakes, range.from, range.to);

  return (
    <>
      <Header settings={settings} current={current} doneSet={doneSet} wsPick={wsPick} />
      <DayNav day={day} current={current} startDate={settings.startDate} />
      {!inPlan(day) ? (
        <div class="card empty">
          {day < 1 ? `计划未开始，第 1 天是 ${settings.startDate}` : '计划已结束。可以在设置里把第 1 天改到新的日期。'}
          <div style="margin-top:12px" class="row wrap">
            <button class="btn grow" onClick={() => go('/today', { day: 1 })}>查看第 1 天</button>
            <button class="btn grow" onClick={() => go('/settings')}>去设置</button>
          </div>
        </div>
      ) : (
        <>
          <DayView day={day} settings={settings} doneSet={doneSet} files={files} wsPick={wsPick} topCause={causeStats[0]} />
          {day === 1 && <CheckpointCard c={diagnose(scores, targets)} />}
          {day === 14 && <CheckpointCard c={checkpoint14(scores)} />}
        </>
      )}
      <Focus scores={scores} settings={settings} causeStats={causeStats} weekLabel={range.label} attempts={attempts} files={files} day={inPlan(day) ? day : undefined} />
    </>
  );
}

function Welcome() {
  return (
    <div class="card stack">
      <h2>开始一个月备考</h2>
      <p class="muted" style="margin:0">把今天设为第 1 天，之后可以在设置里修改日期、考试日期、每日时长和各科目标分。</p>
      <button class="btn primary block" onClick={() => put('settings', { ...DEFAULT_SETTINGS, startDate: todayISO() })}>
        今天是第 1 天
      </button>
      <button class="btn block" onClick={() => go('/settings')}>自己设置日期</button>
    </div>
  );
}

function Header({ settings, current, doneSet, wsPick }: { settings: Settings; current: number; doneSet: Set<string>; wsPick: (d: number) => 'writing' | 'speaking' }) {
  const week = inPlan(current) ? Math.ceil(current / 7) : null;
  let total = 0;
  let done = 0;
  if (week) {
    for (const d of weekDays(week)) {
      const dd = displayDay(d, settings.dailyHours, wsPick)!;
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
              <a href="#/today" onClick={(e) => { e.preventDefault(); go('/today'); }}>回到今天</a>
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

function DayView(props: { day: number; settings: Settings; doneSet: Set<string>; files: FileMeta[]; wsPick: (d: number) => 'writing' | 'speaking'; topCause?: CauseCount }) {
  const { day, settings, doneSet, files } = props;
  const dd = useMemo(() => displayDay(day, settings.dailyHours, props.wsPick)!, [day, settings.dailyHours, props.wsPick(day)]);
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
      {settings.dailyHours === 3 && (
        <div class="small muted">
          当前为 3 小时版：写作和口语{settings.adaptive !== false ? '按分数分配（弱的一科每 3 天练 2 天；分数不足时单双数天交替）' : '隔天交替（单数天写作、双数天口语）'}。
        </div>
      )}
    </>
  );
}

// ---- 开始任务 ----
function startTimer(timerKey: string | undefined, day: number, label?: string) {
  if (!timerKey) return;
  if (timer.isActive() && !confirm('已有计时在进行，要替换成新的计时吗？')) return;
  timer.start(timerKey, { day, label });
  toast(`已开始：${TIMER_PRESETS[timerKey].label}`);
}

// 听力 / 阅读：打开题目和音频，下半屏是答题卡；没导入文件时可以只用答题卡
function startTest(ref: TaskRef, files: FileMeta[], day: number, timerKey?: string) {
  const m = matchTask(ref, files);
  const label = `剑${ref.book} Test ${ref.test}`;
  const sheet = ref.skill === 'listening' || ref.skill === 'reading' ? `${ref.book}-${ref.test}-${ref.skill}` : undefined;
  if (!m.pdf && m.audios.length === 0) {
    if (sheet) {
      toast(`未导入${m.missing}。可以去资料库导入，或先只用答题卡`, { label: '答题卡', run: () => go('/sheet', { book: ref.book, test: ref.test, skill: ref.skill, day }) }, 7000);
    } else {
      toast(`未导入${m.missing}，去资料库导入`, { label: '去导入', run: () => go('/library') }, 6000);
    }
    return;
  }
  startTimer(timerKey, day, label);
  go('/view', { pdf: m.pdf?.id, page: m.page, audio: m.audios.map((a) => a.id).join(',') || undefined, sheet, day });
}

async function startWriting(task: DisplayTask, files: FileMeta[], day: number) {
  const essayTask = task.timer === 'writingT1' ? 'T1' : 'T2';
  const label = task.ref ? `剑${task.ref.book} Test ${task.ref.test} Task ${essayTask.slice(1)}` : undefined;
  startTimer(task.timer, day, label);
  const id = await createEssay({ task: essayTask, label, day });
  const pdf = task.ref ? matchTask(task.ref, files).pdf : undefined;
  if (pdf) go('/view', { pdf: pdf.id, essay: id, day });
  else go('/timer', { tab: 'writing', essay: id, day });
}

function startSpeaking(task: DisplayTask, day: number) {
  const part = task.timer === 'speakingP2' ? 'P2' : /Part 1–3|完整/.test(task.text) ? 'full' : 'P1';
  go('/timer', { tab: 'speaking', part, day });
}

function TaskRow({ day, task, done, files, topCause }: { day: number; task: DisplayTask; done: boolean; files: FileMeta[]; topCause?: CauseCount }) {
  const isCauseTask = task.key === 'X' && task.text.includes('错因专项');
  const startable = task.skill !== 'vocab' && task.skill !== 'review';

  const onStart = () => {
    if (task.skill === 'writing') return void startWriting(task, files, day);
    if (task.skill === 'speaking') return startSpeaking(task, day);
    if (task.ref) return startTest(task.ref, files, day, task.timer);
    startTimer(task.timer, day);
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
            {topCause ? (
              <>本周最多的错因：{topCause.label}（{topCause.count} 次）。{CAUSE_ADVICE[topCause.key]}</>
            ) : (
              '本周还没有错题记录'
            )}
          </div>
        )}
      </div>
      {startable && (
        <button class="btn small" style="margin-top:4px" onClick={onStart}>开始</button>
      )}
    </div>
  );
}

function CheckpointCard({ c }: { c: Checkpoint }) {
  const cls = c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : c.level === 'danger' ? 'danger' : 'info';
  return (
    <div class={`banner ${cls} stack`} style="gap:4px">
      <b>{c.title}</b>
      {c.lines.map((l) => <div>{l}</div>)}
    </div>
  );
}

// 按分数给出的当前重点
function Focus(props: { scores: Score[]; settings: Settings; causeStats: CauseCount[]; weekLabel: string; attempts: Attempt[]; files: FileMeta[]; day?: number }) {
  const g = gaps(targetsOf(props.settings), currentBands(props.scores));
  const behind = g.filter((x) => x.gap > 0);
  const weakLR = g.find((x) => (x.skill === 'listening' || x.skill === 'reading') && x.gap > 0);
  const spare = weakLR ? suggestSpare(weakLR.skill as 'listening' | 'reading', props.attempts) : undefined;
  const top = props.causeStats[0];
  if (!g.length && !top) return null;

  return (
    <div class="card stack" style="gap:8px">
      <h3 style="margin:0">当前重点</h3>
      {g.length > 0 && (
        <div class="stack" style="gap:4px">
          {g.map((x) => (
            <div class="row small" style="gap:8px">
              <span style="width:36px">{SKILL_NAME[x.skill]}</span>
              <div class="grow" style="background:var(--surface-2);border-radius:4px;height:10px;position:relative">
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(100, (x.current / 9) * 100)}%`, background: x.gap > 0 ? 'var(--warn)' : 'var(--ok)', borderRadius: '4px' }} />
                <div style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${(x.target / 9) * 100}%`, width: '2px', background: 'var(--text)' }} />
              </div>
              <span class="mono" style="width:92px;text-align:right">{x.current} / {x.target}{x.gap > 0 ? ` 差${x.gap}` : ' ✓'}</span>
            </div>
          ))}
          <div class="small muted">最近两次成绩的平均，竖线是目标分（可在设置里改）。</div>
        </div>
      )}
      {behind.length > 0 && (
        <div class="small">优先补：<b>{behind.slice(0, 2).map((x) => SKILL_NAME[x.skill]).join('、')}</b>。</div>
      )}
      {top && (
        <div class="small">
          {props.weekLabel}最多的错因：<b>{top.label}</b>（{top.count} 次）。{CAUSE_ADVICE[top.key]}
        </div>
      )}
      {spare && props.day && (
        <div class="row small">
          <span class="grow">加练建议：剑{spare.book} Test {spare.test} {SKILL_NAME[spare.skill]}（备用题）</span>
          <button class="btn small" onClick={() => startTest({ book: spare.book, test: spare.test, skill: spare.skill }, props.files, props.day!)}>开始</button>
        </div>
      )}
    </div>
  );
}
