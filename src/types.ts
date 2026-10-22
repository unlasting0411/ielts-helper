// 数据模型，对应交接文档第三部分与第六部分

export type Skill = 'listening' | 'reading' | 'writing' | 'speaking';
export type FileCategory = 'test' | 'audio' | 'answer' | 'speaking' | 'rubric' | 'other';

export type FileBlob = { id: string; blob: Blob };

export type Bookmark = { label: string; page: number };

export type FileMeta = {
  id: string;
  name: string;
  mime: string;
  size: number;
  category: FileCategory;
  book?: number;
  test?: number;
  skill?: Skill | 'all';
  section?: number;
  bookmarks: Bookmark[];
  lastPage?: number;
  lastTime?: number;
  importedAt: number;
};

export type ExamMode = 'computer' | 'paper' | 'undecided';

export type Settings = {
  id: 'main';
  startDate: string;
  examDate?: string;
  examMode: ExamMode;
  dailyHours: 6 | 3;
  targets?: SkillTargets; // 各科目标分，默认 8 / 8 / 6.5 / 6.5（总和 29）
  adaptive?: boolean; // 按分数调整（默认开启）
};

export type Progress = { id: string; day: number; taskKey: string; done: boolean; doneAt?: number };

export type Score = {
  id: string;
  day: number;
  label: string;
  listeningRaw?: number;
  readingRaw?: number;
  writing?: number;
  speaking?: number;
  createdAt: number;
};

export type Mistake = {
  id: string;
  source: string;
  skill: 'listening' | 'reading';
  myAnswer: string;
  correctAnswer: string;
  cause: string;
  note?: string;
  createdAt: number;
};

export type Synonym = {
  id: string;
  question: string;
  original: string;
  source?: string;
  reviewCount: number;
  lastReviewedAt?: number;
  createdAt: number;
};

export type TaskRef = { book: number; test: number; skill: string };

export type Task = {
  key: string;
  skill: Skill | 'vocab' | 'review';
  text: string;
  ref?: TaskRef;
  timer?: string;
};

export type DayPlan = {
  day: number;
  week: number;
  type: 'practice' | 'mock' | 'review' | 'taper';
  tasks: Task[];
  notes?: string;
};

// ---- 第二版新增：答题卡、口语录音、写作 ----

export type PracticeSkill = 'listening' | 'reading';

// 每套题的答案（由使用者自己录入）。一个答案可写多个可接受写法，用 / 分隔；括号内为可省略的词
export type AnswerKey = {
  id: string; // `${book}-${test}-${skill}`
  book: number;
  test: number;
  skill: PracticeSkill;
  answers: string[]; // 40 个
  updatedAt: number;
};

// 一次答题卡作答（草稿或已交卷）
export type Attempt = {
  id: string;
  book: number;
  test: number;
  skill: PracticeSkill;
  day?: number;
  answers: string[]; // 40 个
  correct?: boolean[]; // 交卷后
  raw?: number; // 交卷后答对数
  submittedAt?: number;
  createdAt: number;
};

export type SpeakingPart = 'P1' | 'P2' | 'P3' | 'full';

export type Recording = {
  id: string;
  part: SpeakingPart;
  topic?: string;
  day?: number;
  durationSec: number;
  mime: string;
  size: number;
  note?: string;
  createdAt: number;
};

export type Essay = {
  id: string;
  task: 'T1' | 'T2';
  label?: string; // 如“剑15 Test 1 Task 2”
  prompt: string;
  text: string;
  day?: number;
  band?: number; // Claude 或老师给的分数
  feedback?: string;
  rewriteOf?: string;
  createdAt: number;
  updatedAt: number;
};

export type SkillTargets = { listening: number; reading: number; writing: number; speaking: number };
