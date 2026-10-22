import { AnswerSheet } from '../components/AnswerSheet';
import type { PracticeSkill } from '../types';
import { numOrUndef } from '../ui';

// 独立答题卡页：做纸质书或在其他 App 里做题时用（?book=15&test=1&skill=reading&day=2）
export function SheetPage({ query }: { query: URLSearchParams }) {
  const skill = query.get('skill');
  return (
    <div class="card">
      <AnswerSheet
        book={numOrUndef(query.get('book') ?? '')}
        test={numOrUndef(query.get('test') ?? '')}
        skill={skill === 'listening' || skill === 'reading' ? (skill as PracticeSkill) : undefined}
        day={numOrUndef(query.get('day') ?? '')}
      />
    </div>
  );
}
