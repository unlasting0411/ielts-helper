import { EssayEditor, createEssay } from '../../components/EssayEditor';
import { countWords } from '../../lib/writing';
import { Icon, fmtDate, go, useStore } from '../../ui';

// 写作：作文列表 + 编辑器（?essay=id 打开某一篇）
export function Writing({ essayId, day }: { essayId?: string; day?: number }) {
  const essays = useStore('essays');
  const open = (id: string) => go('/timer', { tab: 'writing', essay: id });

  if (essayId) {
    return (
      <>
        <button class="btn small" style="align-self:flex-start" onClick={() => go('/timer', { tab: 'writing' })}>
          <Icon name="left" /> 作文列表
        </button>
        <EssayEditor id={essayId} onOpen={open} onDeleted={() => go('/timer', { tab: 'writing' })} />
      </>
    );
  }

  const list = [...(essays ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <div class="row">
        <button class="btn primary grow" onClick={async () => open(await createEssay({ task: 'T1', day }))}><Icon name="plus" /> Task 1</button>
        <button class="btn primary grow" onClick={async () => open(await createEssay({ task: 'T2', day }))}><Icon name="plus" /> Task 2</button>
      </div>
      <div class="card">
        <h3>我的作文（{list.length}）</h3>
        {essays && list.length === 0 && <div class="empty small">还没有作文。手写的作文也可以打进来，方便发给 Claude 批改。</div>}
        <div class="list">
          {list.map((e) => (
            <button class="item btn ghost block" style="justify-content:flex-start;text-align:left;height:auto;padding:10px 0" onClick={() => open(e.id)}>
              <div class="grow" style="min-width:0">
                <div class="row" style="gap:6px">
                  <span class="tag writing">Task {e.task.slice(1)}</span>
                  {e.rewriteOf && <span class="tag">重写</span>}
                  <b class="ellipsis">{e.label || e.prompt.slice(0, 24) || '未命名'}</b>
                </div>
                <div class="small muted">
                  {countWords(e.text)} 词 · {e.band != null ? `${e.band.toFixed(1)} 分` : '未批改'} · {fmtDate(e.updatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
