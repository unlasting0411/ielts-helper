import type { FileCategory, FileMeta, Skill } from '../types';

// 交接文档第五部分：文件名识别规则（不区分大小写，按顺序匹配）
const rules = {
  // 与交接文档相比，C/T/S 规则末尾的 \b 放宽为“后面不再跟数字”，以识别 C17T3S4 这类紧凑命名
  book:    [/剑\s*(\d{1,2})/, /cambridge\s*(?:ielts)?\s*(\d{1,2})/i, /\bC(\d{1,2})(?!\d)/],
  test:    [/test\s*(\d)/i, /T(\d)(?!\d)/, /第\s*([一二三四1-4])\s*套/],
  section: [/section\s*(\d)/i, /(?<![A-Za-z])S(\d)(?!\d)/, /part\s*(\d)/i],
  skill: {
    listening: /听力|listening/i,
    reading:   /阅读|reading/i,
    writing:   /写作|writing/i,
    speaking:  /口语|speaking/i,
  } as Record<Skill, RegExp>,
  category: {
    answer:   /解析|精讲|答案|answer|key/i,
    rubric:   /评分标准|band\s*descriptor/i,
    speaking: /题库|口语.*(讲义|话题)/,
  } as Record<'answer' | 'rubric' | 'speaking', RegExp>,
};

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };

function firstNum(name: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = name.match(re);
    if (m) return CN_NUM[m[1]] ?? Number(m[1]);
  }
  return undefined;
}

export type Tags = Pick<FileMeta, 'category' | 'book' | 'test' | 'skill' | 'section'>;

export function isAudio(name: string, mime: string): boolean {
  return mime.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|opus|flac|amr)$/i.test(name);
}
export function isPdf(name: string, mime: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name);
}

export function guessTags(fileName: string, mime: string): Tags {
  const name = fileName.replace(/\.[^.]+$/, ''); // 去掉扩展名
  const book = firstNum(name, rules.book);
  const test = firstNum(name, rules.test);
  const section = firstNum(name, rules.section);

  let skill: Tags['skill'];
  for (const [k, re] of Object.entries(rules.skill)) {
    if (re.test(name)) { skill = k as Skill; break; }
  }

  let category: FileCategory = 'other';
  for (const [k, re] of Object.entries(rules.category)) {
    if (re.test(name)) { category = k as FileCategory; break; }
  }

  if (isAudio(fileName, mime)) {
    // 假设：所有音频都归入 audio 类别；识别到册号时 skill 默认为听力
    category = 'audio';
    if (book != null && !skill) skill = 'listening';
  } else if (isPdf(fileName, mime)) {
    if (book != null && category === 'other') category = 'test';
    // 整本书或未标科目的单套 PDF：skill 设为 'all'
    if (book != null && !skill) skill = 'all';
  }

  return {
    category,
    book,
    test,
    skill,
    section: isAudio(fileName, mime) || skill === 'listening' ? section : undefined,
  };
}
