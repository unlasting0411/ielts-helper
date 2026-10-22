import type { Essay } from '../types';

// 英文词数：连字符词、缩写算一个词，数字也算一个词
export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

export const MIN_WORDS = { T1: 150, T2: 250 } as const;

// 复制给 Claude 批改用的完整文本
export function reviewRequest(e: Pick<Essay, 'task' | 'label' | 'prompt' | 'text'>): string {
  const words = countWords(e.text);
  const taskName = e.task === 'T1' ? 'Task 1（学术类图表作文）' : 'Task 2（议论文）';
  return [
    `请按雅思学术类写作${taskName}的官方评分标准严格批改下面这篇作文。`,
    '',
    '要求：',
    `1. 分别给出四项分数：${e.task === 'T1' ? 'Task Achievement' : 'Task Response'}、Coherence and Cohesion、Lexical Resource、Grammatical Range and Accuracy，再给出总分（0.5 分一档）。`,
    '2. 评分要严格，宁可偏低也不要偏高；每项说明扣分的具体原因，并引用原文。',
    '3. 列出所有语法和用词错误，给出改法。',
    '4. 指出最影响分数的两个问题，以及下次写作时怎么改。',
    `5. 字数${words < (e.task === 'T1' ? 150 : 250) ? '不足要求，请按规则考虑扣分' : '已满足要求'}。`,
    '',
    `【题目】${e.label ? `（${e.label}）` : ''}`,
    e.prompt.trim() || '（未填写题目）',
    '',
    `【作文】（${words} 词）`,
    e.text.trim(),
  ].join('\n');
}
