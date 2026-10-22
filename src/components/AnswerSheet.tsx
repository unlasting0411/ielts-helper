import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { LISTENING_BANDS, READING_BANDS } from '../data/constants';
import { del, getAll, getOne, put, uid } from '../db';
import { QUESTION_COUNT, grade, keyId, parseKeyText, questionSource } from '../lib/grading';
import { causesFor } from '../lib/notes';
import { dayNumber, inPlan } from '../lib/plan';
import { fmtBand, rawToBand } from '../lib/score';
import type { AnswerKey, Attempt, PracticeSkill } from '../types';
import { fmtDate, numOrUndef, toast, useSettings, useStore } from '../ui';

const QUICK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'TRUE', 'FALSE', 'NOT GIVEN', 'YES', 'NO'];
const empty = () => Array.from({ length: QUESTION_COUNT }, () => '');
const SKILL_CN: Record<PracticeSkill, string> = { listening: '听力', reading: '阅读' };

type Props = { book?: number; test?: number; skill?: PracticeSkill; day?: number; compact?: boolean };

// 答题卡：作答 → 交卷判分 → 错题记入错题本、答对数写入分数页
export function AnswerSheet(props: Props) {
  const [book, setBook] = useState(props.book);
  const [test, setTest] = useState(props.test);
  const [skill, setSkill] = useState<PracticeSkill>(props.skill ?? 'reading');
  const ready = book != null && test != null;

  return (
    <div class="stack" style="gap:10px">
      {(!props.book || !props.test || !props.skill) && (
        <div class="grid3">
          <input type="number" inputMode="numeric" aria-label="剑桥册号" placeholder="册号" value={book ?? ''} onInput={(e) => setBook(numOrUndef((e.target as HTMLInputElement).value))} />
          <input type="number" inputMode="numeric" aria-label="Test" placeholder="Test" value={test ?? ''} onInput={(e) => setTest(numOrUndef((e.target as HTMLInputElement).value))} />
          <select aria-label="科目" value={skill} onChange={(e) => setSkill((e.target as HTMLSelectElement).value as PracticeSkill)}>
            <option value="listening">听力</option>
            <option value="reading">阅读</option>
          </select>
        </div>
      )}
      {ready ? <Sheet key={keyId(book!, test!, skill)} book={book!} test={test!} skill={skill} day={props.day} compact={props.compact} /> : <div class="empty small">先填写册号和 Test</div>}
    </div>
  );
}

function Sheet({ book, test, skill, day, compact }: { book: number; test: number; skill: PracticeSkill; day?: number; compact?: boolean }) {
  const kid = keyId(book, test, skill);
  const draftId = `draft-${kid}`;
  const [key, setKey] = useState<AnswerKey | null | undefined>(undefined);
  const [answers, setAnswers] = useState<string[]>(empty);
  const [mode, setMode] = useState<'answer' | 'key' | 'result'>('answer');
  const [result, setResult] = useState<Attempt | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getOne('answerKeys', kid).then((k) => setKey(k ?? null));
    getOne('attempts', draftId).then((d) => {
      if (d) setAnswers([...d.answers, ...empty()].slice(0, QUESTION_COUNT));
      loaded.current = true;
    });
  }, [kid]);

  // 草稿自动保存，离开页面不会丢
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      if (answers.some(Boolean)) put('attempts', { id: draftId, book, test, skill, answers, createdAt: Date.now() });
    }, 400);
    return () => clearTimeout(t);
  }, [answers]);

  const submit = async () => {
    if (!key) {
      toast('先录入这套题的答案，才能判分');
      setMode('key');
      return;
    }
    const g = grade(answers, key.answers);
    const attempt: Attempt = {
      id: uid(),
      book, test, skill, day,
      answers,
      correct: g.correct.map((c) => c === true),
      raw: g.raw,
      submittedAt: Date.now(),
      createdAt: Date.now(),
    };
    await put('attempts', attempt);
    await del('attempts', draftId);
    setResult(attempt);
    setMode('result');
  };

  const title = `剑${book} Test ${test} ${SKILL_CN[skill]}`;

  if (key === undefined) return <div class="empty small">加载中…</div>;

  return (
    <div class="stack" style="gap:10px">
      <div class="row between">
        <b>{title}</b>
        <div class="row" style="gap:4px">
          {mode !== 'answer' && <button class="btn small" onClick={() => setMode('answer')}>作答</button>}
          {mode !== 'key' && <button class="btn small" onClick={() => setMode('key')}>{key ? '改答案' : '录入答案'}</button>}
        </div>
      </div>
      {mode === 'answer' && (
        <AnswerGrid
          skill={skill}
          values={answers}
          onChange={setAnswers}
          compact={compact}
          footer={
            <div class="row">
              <button class="btn grow" onClick={() => confirm('清空本次填写的答案？') && setAnswers(empty())}>清空</button>
              <button class="btn primary grow" onClick={submit}>交卷判分</button>
            </div>
          }
        />
      )}
      {mode === 'key' && (
        <KeyEditor
          skill={skill}
          initial={key?.answers}
          onSave={async (answers) => {
            const k: AnswerKey = { id: kid, book, test, skill, answers, updatedAt: Date.now() };
            await put('answerKeys', k);
            setKey(k);
            toast('答案已保存');
            setMode('answer');
          }}
        />
      )}
      {mode === 'result' && result && key && <Result attempt={result} keyAnswers={key.answers} day={day} />}
      {mode !== 'result' && <History book={book} test={test} skill={skill} onOpen={(a) => { setResult(a); setMode('result'); }} />}
    </div>
  );
}

function AnswerGrid(props: { skill: PracticeSkill; values: string[]; onChange: (update: (prev: string[]) => string[]) => void; compact?: boolean; footer?: ComponentChildren }) {
  const [focus, setFocus] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, v: string) => props.onChange((prev) => prev.map((x, j) => (j === i ? v : x)));
  const groups = [0, 10, 20, 30];
  const filled = props.values.filter((v) => v.trim()).length;

  return (
    <div class="stack" style="gap:8px">
      <div class="small muted">已填 {filled} / {QUESTION_COUNT}</div>
      {groups.map((g) => (
        <div>
          <div class="small muted" style="margin:2px 0">
            {props.skill === 'listening' ? `Section ${g / 10 + 1}（${g + 1}–${g + 10}）` : `第 ${g + 1}–${g + 10} 题`}
          </div>
          <div class="sheet-grid">
            {Array.from({ length: 10 }, (_, k) => {
              const i = g + k;
              return (
                <label class="sheet-cell">
                  <span class="mono small">{i + 1}</span>
                  <input
                    ref={(el) => { refs.current[i] = el; }}
                    type="text"
                    autocapitalize="off"
                    autocomplete="off"
                    spellcheck={false}
                    enterKeyHint="next"
                    value={props.values[i]}
                    onFocus={() => setFocus(i)}
                    onInput={(e) => set(i, (e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        refs.current[i + 1]?.focus();
                      }
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {focus != null && (
        <div class="chips quickfill" role="group" aria-label={`快速填写第 ${focus + 1} 题`}>
          <span class="small muted" style="align-self:center;flex:none">第 {focus + 1} 题</span>
          {QUICK.map((q) => (
            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                set(focus, q);
                const next = Math.min(QUESTION_COUNT - 1, focus + 1);
                refs.current[next]?.focus();
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {props.footer}
    </div>
  );
}

function KeyEditor({ skill, initial, onSave }: { skill: PracticeSkill; initial?: string[]; onSave: (a: string[]) => void }) {
  const [vals, setVals] = useState<string[]>(() => [...(initial ?? []), ...empty()].slice(0, QUESTION_COUNT));
  const [paste, setPaste] = useState('');
  const filled = vals.filter((v) => v.trim()).length;
  return (
    <div class="stack" style="gap:8px">
      <div class="small muted">
        从你的答案页录入，只保存在本机。多个写法用 / 分隔（如 <code>15/fifteen</code>），可省略的词加括号（如 <code>(the) river</code>），两题顺序不限写成 <code>B&amp;D</code>。
      </div>
      <details>
        <summary class="small" style="cursor:pointer;min-height:36px;display:flex;align-items:center">整段粘贴（每行一个，或“1. A 2. B …”，“21-22 B, D”）</summary>
        <textarea value={paste} placeholder={'1. library\n2. TRUE\n3 C\n21-22 B, D'} onInput={(e) => setPaste((e.target as HTMLTextAreaElement).value)} />
        <button class="btn small" style="margin-top:6px" onClick={() => { setVals(parseKeyText(paste)); toast('已按粘贴内容填好，检查后保存'); }}>解析填入</button>
      </details>
      <AnswerGrid
        skill={skill}
        values={vals}
        onChange={setVals}
        footer={
          <button
            class="btn primary block"
            onClick={() => {
              if (filled < QUESTION_COUNT && !confirm(`只填了 ${filled} 题答案，没填的题不计分。确定保存？`)) return;
              onSave(vals.map((v) => v.trim()));
            }}
          >
            保存答案（{filled}/{QUESTION_COUNT}）
          </button>
        }
      />
    </div>
  );
}

function Result({ attempt, keyAnswers, day }: { attempt: Attempt; keyAnswers: string[]; day?: number }) {
  const settings = useSettings();
  const scores = useStore('scores');
  const g = grade(attempt.answers, keyAnswers);
  const band = rawToBand(g.raw, attempt.skill === 'listening' ? LISTENING_BANDS : READING_BANDS);
  const wrong = g.correct.map((c, i) => (c === false ? i : -1)).filter((i) => i >= 0);
  const [causes, setCauses] = useState<Record<number, string>>({});
  const [savedMistakes, setSavedMistakes] = useState(false);
  const current = settings ? dayNumber(settings.startDate) : undefined;
  const [scoreDay, setScoreDay] = useState<number | undefined>(attempt.day ?? day ?? (current && inPlan(current) ? current : undefined));
  const label = `剑${attempt.book} Test ${attempt.test}`;
  const options = causesFor(attempt.skill);
  const chosen = wrong.filter((i) => causes[i]);

  const saveMistakes = async () => {
    for (const i of chosen) {
      await put('mistakes', {
        id: uid(),
        source: questionSource(attempt.book, attempt.test, attempt.skill, i + 1),
        skill: attempt.skill,
        myAnswer: attempt.answers[i].trim(),
        correctAnswer: keyAnswers[i].replace(/&/g, ' / '),
        cause: causes[i],
        note: '答题卡判分生成',
        createdAt: Date.now(),
      });
    }
    setSavedMistakes(true);
    toast(`已记入错题本 ${chosen.length} 条`);
  };

  const saveScore = async () => {
    if (!scoreDay) return toast('请选择第几天');
    const field = attempt.skill === 'listening' ? 'listeningRaw' : 'readingRaw';
    const existing = (scores ?? []).find((s) => s.day === scoreDay && s.label === label);
    if (existing) {
      if (existing[field] != null && existing[field] !== g.raw && !confirm(`第 ${scoreDay} 天 ${label} 已有${SKILL_CN[attempt.skill]} ${existing[field]}，改成 ${g.raw}？`)) return;
      await put('scores', { ...existing, [field]: g.raw });
    } else {
      await put('scores', { id: uid(), day: scoreDay, label, [field]: g.raw, createdAt: Date.now() });
    }
    toast(`已写入分数页：第 ${scoreDay} 天 ${label} ${SKILL_CN[attempt.skill]} ${g.raw}`);
  };

  return (
    <div class="stack" style="gap:10px">
      <div class="banner info row between">
        <span>答对 <b class="mono">{g.raw}</b> / {g.total}{g.total < QUESTION_COUNT && '（有题未录答案）'}</span>
        <span>约 <b>{fmtBand(band)}</b> 分</span>
      </div>
      <div class="row">
        <select aria-label="写入第几天" value={scoreDay ?? ''} onChange={(e) => setScoreDay(numOrUndef((e.target as HTMLSelectElement).value))} style="flex:1">
          <option value="">第几天</option>
          {Array.from({ length: 28 }, (_, i) => <option value={i + 1}>第 {i + 1} 天</option>)}
        </select>
        <button class="btn primary" onClick={saveScore}>写入分数页</button>
      </div>

      {wrong.length === 0 ? (
        <div class="banner ok">全对！</div>
      ) : (
        <>
          <div class="small muted">错了 {wrong.length} 题。给要记录的题选错因，再一起记入错题本。</div>
          <div class="list">
            {wrong.map((i) => (
              <div class="item stack" style="gap:6px">
                <div class="row between small">
                  <b class="mono">Q{i + 1}</b>
                  <span>
                    我的 <span style="color:var(--danger)">{attempt.answers[i].trim() || '（空）'}</span> · 正确 <span style="color:var(--ok)">{keyAnswers[i].replace(/&/g, ' / ')}</span>
                  </span>
                </div>
                <select aria-label={`第 ${i + 1} 题错因`} value={causes[i] ?? ''} disabled={savedMistakes} onChange={(e) => setCauses({ ...causes, [i]: (e.target as HTMLSelectElement).value })}>
                  <option value="">不记录</option>
                  {options.map((c) => <option value={c.key}>{c.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button class="btn primary block" disabled={chosen.length === 0 || savedMistakes} onClick={saveMistakes}>
            {savedMistakes ? '已记入错题本' : `记入错题本（${chosen.length}）`}
          </button>
        </>
      )}
    </div>
  );
}

function History({ book, test, skill, onOpen }: { book: number; test: number; skill: PracticeSkill; onOpen: (a: Attempt) => void }) {
  const [list, setList] = useState<Attempt[]>([]);
  useEffect(() => {
    getAll('attempts').then((all) =>
      setList(all.filter((a) => a.submittedAt && a.book === book && a.test === test && a.skill === skill).sort((a, b) => b.submittedAt! - a.submittedAt!)),
    );
  }, [book, test, skill]);
  if (!list.length) return null;
  return (
    <div class="small">
      <div class="muted">以前的作答</div>
      {list.map((a) => (
        <button class="btn ghost small" onClick={() => onOpen(a)}>
          {fmtDate(a.submittedAt!)} · 答对 {a.raw}
        </button>
      ))}
    </div>
  );
}
