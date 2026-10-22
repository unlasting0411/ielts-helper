// 静态数据，取自交接文档第七部分

// [最低答对数, 分数]，从高到低查找第一个满足 raw >= min 的条目
export const LISTENING_BANDS: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5],
  [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [0, 0],
];
export const READING_BANDS: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5],
  [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [0, 0],
];

// 总分：四科平均后按雅思规则取整
export function overallBand(l: number, r: number, w: number, s: number): number {
  const avg = (l + r + w + s) / 4;
  const base = Math.floor(avg);
  const frac = avg - base;
  if (frac < 0.25) return base;
  if (frac < 0.75) return base + 0.5;
  return base + 1;
}
// 目标：四科总和 >= 29
export const TARGET_SUM = 29;

export const MISTAKE_CAUSES = [
  { key: 'spelling',   label: '拼写错',            skill: 'listening' },
  { key: 'plural',     label: '单复数 / 词形',      skill: 'listening' },
  { key: 'distractor', label: '被干扰项骗',          skill: 'both' },
  { key: 'synonym',    label: '没认出同义替换',      skill: 'both' },
  { key: 'lost',       label: '走神 / 跟丢',        skill: 'listening' },
  { key: 'vocab',      label: '生词不认识',          skill: 'reading' },
  { key: 'locate',     label: '定位失败',            skill: 'reading' },
  { key: 'tfng',       label: '判断题逻辑（F/NG 混淆）', skill: 'reading' },
  { key: 'time',       label: '时间不够',            skill: 'both' },
  { key: 'other',      label: '其他',                skill: 'both' },
] as const;

export type TimerSegment = { name: string; sec: number };
export type TimerPreset = { label: string; segments: TimerSegment[]; alerts: number[] };

// alerts 单位为秒，表示从开始算起的提醒时间点
export const TIMER_PRESETS: Record<string, TimerPreset> = {
  listening30: { label: '听力 30 分钟', segments: [{ name: '听力', sec: 1800 }], alerts: [1680] },
  reading60:   { label: '阅读 60 分钟', segments: [{ name: '阅读', sec: 3600 }], alerts: [1200, 2400] },
  writingT1:   { label: '写作 Task 1', segments: [{ name: 'Task 1', sec: 1200 }], alerts: [1020] },
  writingT2:   { label: '写作 Task 2', segments: [{ name: 'Task 2', sec: 2400 }], alerts: [2220] },
  writing60:   { label: '写作整套', segments: [{ name: '写作', sec: 3600 }], alerts: [2400, 3420] },
  speakingP2:  { label: '口语 Part 2', segments: [{ name: '准备', sec: 60 }, { name: '作答', sec: 120 }], alerts: [] },
  mockFull:    { label: '模考连续', segments: [
                  { name: '听力', sec: 1800 }, { name: '阅读', sec: 3600 }, { name: '写作', sec: 3600 }],
                alerts: [1680, 3000, 4200, 7800, 8820] },
};

// 提醒文字（第七部分“计时预设”说明）。key 为 `${presetKey}@${秒}`
export const ALERT_TEXTS: Record<string, string> = {
  'listening30@1680': '还剩 2 分钟：检查拼写和单复数',
  'reading60@1200': '20 分钟：换下一篇',
  'reading60@2400': '40 分钟：换下一篇',
  'writingT1@1020': '还剩约 3 分钟：留时间检查',
  'writingT2@2220': '还剩约 3 分钟：留时间检查',
  'writing60@2400': '40 分钟：Task 2 应已完成，开始 Task 1',
  'writing60@3420': '还剩约 3 分钟：留时间检查',
  'mockFull@1680': '还剩 2 分钟：检查拼写和单复数',
  'mockFull@3000': '阅读 20 分钟：换下一篇',
  'mockFull@4200': '阅读 40 分钟：换下一篇',
  'mockFull@7800': '写作 40 分钟：Task 2 应已完成，开始 Task 1',
  'mockFull@8820': '还剩约 3 分钟：留时间检查',
};

// 每天自动追加的单词卡片
export const VOCAB_TASK = {
  key: 'V',
  skill: 'vocab',
  text: '不背单词 30 分钟（新词 50–80，第 26 天起只复习）+ 王陆语料库 30 分钟',
} as const;

export const PLAN_DAYS = 28;
