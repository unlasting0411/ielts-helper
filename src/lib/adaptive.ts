// 按分数调整计划（纯函数）
import { LISTENING_BANDS, READING_BANDS, TARGET_SUM } from '../data/constants';
import type { Attempt, Score, Settings, SkillTargets } from '../types';
import { rawToBand } from './score';

export type Skill4 = keyof SkillTargets;
export const SKILLS: Skill4[] = ['listening', 'reading', 'writing', 'speaking'];
export const SKILL_NAME: Record<Skill4, string> = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };

// 总和 29 的默认分配：听读偏高、写说偏低，是多数中国考生的常见结构
export const DEFAULT_TARGETS: SkillTargets = { listening: 8, reading: 8, writing: 6.5, speaking: 6.5 };

export function targetsOf(s: Settings | null | undefined): SkillTargets {
  return s?.targets ?? DEFAULT_TARGETS;
}

function bandOf(s: Score, skill: Skill4): number | undefined {
  if (skill === 'listening') return s.listeningRaw != null ? rawToBand(s.listeningRaw, LISTENING_BANDS) : undefined;
  if (skill === 'reading') return s.readingRaw != null ? rawToBand(s.readingRaw, READING_BANDS) : undefined;
  return s[skill];
}

// 每科当前水平：最近两次有该科成绩的平均，减少单次波动
export function currentBands(scores: Score[]): Partial<Record<Skill4, number>> {
  const sorted = [...scores].sort((a, b) => b.day - a.day || b.createdAt - a.createdAt);
  const out: Partial<Record<Skill4, number>> = {};
  for (const skill of SKILLS) {
    const vals = sorted.map((s) => bandOf(s, skill)).filter((v): v is number => v != null).slice(0, 2);
    if (vals.length) out[skill] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }
  return out;
}

export type Gap = { skill: Skill4; current: number; target: number; gap: number };

// 离目标的差距，从大到小
export function gaps(targets: SkillTargets, current: Partial<Record<Skill4, number>>): Gap[] {
  return SKILLS.filter((k) => current[k] != null)
    .map((k) => ({ skill: k, current: current[k]!, target: targets[k], gap: Math.round((targets[k] - current[k]!) * 100) / 100 }))
    .sort((a, b) => b.gap - a.gap);
}

// 3 小时版写作 / 口语的分配：
// 差距相差 ≥ 0.5 时，弱的一科每 3 天练 2 天；否则单数天写作、双数天口语
export function writingOrSpeaking(day: number, current: Partial<Record<Skill4, number>>, targets: SkillTargets, adaptive: boolean): 'writing' | 'speaking' {
  const w = current.writing;
  const s = current.speaking;
  if (adaptive && w != null && s != null) {
    const gw = targets.writing - w;
    const gs = targets.speaking - s;
    if (Math.abs(gw - gs) >= 0.5) {
      const weak = gw > gs ? 'writing' : 'speaking';
      const strong = weak === 'writing' ? 'speaking' : 'writing';
      return day % 3 === 0 ? strong : weak;
    }
  }
  return day % 2 === 1 ? 'writing' : 'speaking';
}

export type Checkpoint = { level: 'ok' | 'warn' | 'danger' | 'pending'; title: string; lines: string[] };

// 第 1 天摸底：和目标比
export function diagnose(scores: Score[], targets: SkillTargets): Checkpoint {
  const day1 = scores.filter((s) => s.day === 1);
  const cur = currentBands(day1);
  const g = gaps(targets, cur);
  if (g.length < 4) {
    return { level: 'pending', title: '摸底结果', lines: ['四科分数都录入后，这里会给出和目标的差距。'] };
  }
  const sum = g.reduce((a, x) => a + x.current, 0);
  const need = Math.round((TARGET_SUM - sum) * 10) / 10;
  const lines = g.map((x) => `${SKILL_NAME[x.skill]} ${x.current} → 目标 ${x.target}${x.gap > 0 ? `（差 ${x.gap}）` : '（已达到）'}`);
  if (need <= 0) return { level: 'ok', title: `摸底总和 ${sum}，已达到 29`, lines: [...lines, '保持节奏，重点放在稳定发挥。'] };
  if (need <= 1.5) return { level: 'ok', title: `摸底总和 ${sum}，离 29 差 ${need}`, lines: [...lines, '差距不大，按计划执行，优先补差距最大的一科。'] };
  if (need <= 3) return { level: 'warn', title: `摸底总和 ${sum}，离 29 差 ${need}`, lines: [...lines, '需要明显提升：把加练和错因专项集中在差距最大的两科。'] };
  return {
    level: 'danger',
    title: `摸底总和 ${sum}，离 29 差 ${need}`,
    lines: [...lines, '一个月补这么多分难度很大。建议按计划练到第 14 天，在第二次检查点认真评估是否推迟考试。'],
  };
}

// 第 14 天检查点：听力或阅读低于 30/40 时考虑推迟考试（取第 12–14 天的最近成绩）
export function checkpoint14(scores: Score[]): Checkpoint {
  const recent = scores.filter((s) => s.day >= 12 && s.day <= 14).sort((a, b) => b.day - a.day || b.createdAt - a.createdAt);
  const l = recent.find((s) => s.listeningRaw != null)?.listeningRaw;
  const r = recent.find((s) => s.readingRaw != null)?.readingRaw;
  if (l == null || r == null) {
    return { level: 'pending', title: '第二次检查点', lines: ['录入今天模考的听力和阅读答对数后，这里会自动判断。'] };
  }
  const low = [l < 30 ? `听力 ${l}/40` : '', r < 30 ? `阅读 ${r}/40` : ''].filter(Boolean);
  if (low.length) {
    return { level: 'danger', title: '检查点未通过', lines: [`${low.join('、')}，低于 30/40。`, '按计划，此时应考虑推迟考试。'] };
  }
  return { level: 'ok', title: '检查点通过', lines: [`听力 ${l}/40、阅读 ${r}/40，都不低于 30。按计划继续。`] };
}

// 错因对应的练法
export const CAUSE_ADVICE: Record<string, string> = {
  spelling: '把错拼的词整理成清单每天默写一遍；听力填空写完立刻检查拼写。',
  plural: '填空前先看空格前后的冠词和动词，判断单复数；最后 2 分钟专门查单复数。',
  distractor: '精听时标出 but / actually / however 等转折，答案常在转折之后。',
  synonym: '每做完一篇就往词对本补 5 组同义替换，并用复习模式过一遍。',
  lost: '听前 30 秒读题划关键词并预判答案类型；跟丢了立刻跳到下一题。',
  vocab: '阅读里不认识又影响答题的词记进单词本，配合王陆语料库复习。',
  locate: '先划题目中的专有名词、数字和关键词再回原文找，定位后只精读前后两句。',
  tfng: '判断题逐句比对：原文说了相反的是 F，原文没提到的是 NG，不要用常识推断。',
  time: '每篇严格 20 分钟，超时就猜一个答案并跳过，复盘时再细看。',
  other: '复盘时把这类错题的共同点写进备注，下周再归类。',
};

// 备用题（交接文档第六部分），按最弱的一科推荐还没做过的
export const SPARE_TESTS: { book: number; test: number; skill: 'listening' | 'reading' }[] = [
  { book: 15, test: 4, skill: 'listening' },
  { book: 17, test: 4, skill: 'listening' },
  { book: 17, test: 4, skill: 'reading' },
  { book: 19, test: 2, skill: 'reading' },
  { book: 19, test: 3, skill: 'listening' },
  { book: 19, test: 3, skill: 'reading' },
  { book: 19, test: 4, skill: 'listening' },
  { book: 19, test: 4, skill: 'reading' },
];

export function suggestSpare(skill: 'listening' | 'reading', attempts: Attempt[]) {
  const done = new Set(attempts.filter((a) => a.submittedAt).map((a) => `${a.book}-${a.test}-${a.skill}`));
  return SPARE_TESTS.find((t) => t.skill === skill && !done.has(`${t.book}-${t.test}-${t.skill}`));
}
