import { numOrUndef, go } from '../ui';
import type { SpeakingPart } from '../types';
import { Speaking } from './practice/Speaking';
import { Writing } from './practice/Writing';
import { TimerPage } from './Timer';

const TABS = [
  { key: 'timer', label: '计时' },
  { key: 'speaking', label: '口语' },
  { key: 'writing', label: '写作' },
];

// 练习：计时 / 口语录音 / 写作
export function Practice({ query }: { query: URLSearchParams }) {
  const tab = TABS.some((t) => t.key === query.get('tab')) ? query.get('tab')! : 'timer';
  const day = numOrUndef(query.get('day') ?? '');
  return (
    <>
      <div class="tabs" role="tablist">
        {TABS.map((t) => (
          <button role="tab" aria-selected={tab === t.key} class={tab === t.key ? 'active' : ''} onClick={() => go('/timer', t.key === 'timer' ? undefined : { tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'timer' && <TimerPage />}
      {tab === 'speaking' && <Speaking key={query.get('part') ?? ''} initialPart={(query.get('part') as SpeakingPart) ?? undefined} day={day} />}
      {tab === 'writing' && <Writing essayId={query.get('essay') ?? undefined} day={day} />}
    </>
  );
}
