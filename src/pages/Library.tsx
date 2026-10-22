import { useEffect, useState } from 'preact/hooks';
import { deleteFile, saveFile, uid, updateFileMeta } from '../db';
import { SKILL_LABEL, refLabel } from '../lib/matcher';
import { guessTags, isAudio, isPdf, type Tags } from '../lib/tagger';
import type { FileCategory, FileMeta } from '../types';
import { Icon, Modal, fmtBytes, go, numOrUndef, toast, useStore } from '../ui';

const CATEGORY_LABEL: Record<FileCategory, string> = {
  test: '真题',
  audio: '音频',
  answer: '解析',
  speaking: '口语',
  rubric: '评分标准',
  other: '其他',
};

export function Library() {
  const files = useStore('files');
  const [pending, setPending] = useState<File[] | null>(null);
  const [cat, setCat] = useState<'' | FileCategory>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<FileMeta | null>(null);
  const [est, setEst] = useState<StorageEstimate | null>(null);

  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
  }, [files]);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  if (!files) return <div class="empty">加载中…</div>;
  const total = files.reduce((a, f) => a + f.size, 0);
  const kw = q.trim().toLowerCase();
  const shown = files.filter((f) => (!cat || f.category === cat) && (!kw || f.name.toLowerCase().includes(kw)));

  return (
    <>
      <label class="btn primary block">
        <Icon name="plus" /> 导入 PDF / 音频
        <input
          type="file"
          multiple
          accept=".pdf,audio/*"
          hidden
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const list = input.files ? [...input.files] : [];
            input.value = '';
            if (list.length) setPending(list);
          }}
        />
      </label>
      {persisted === false && files.length > 0 && (
        <div class="banner warn row">
          <span class="grow">浏览器还没同意长期保存，空间紧张时可能清理导入的文件。</span>
          <button
            class="btn small"
            onClick={async () => {
              const ok = await navigator.storage.persist().catch(() => false);
              setPersisted(ok);
              toast(ok ? '已开启长期保存' : '浏览器暂未同意。先“添加到主屏幕”并多用几次，之后再点通常会成功。', undefined, 6000);
            }}
          >
            申请
          </button>
        </div>
      )}
      <div class="small muted row between">
        <span>{files.length} 个文件 · 共 {fmtBytes(total)}</span>
        <span>{est?.quota != null && est.usage != null ? `浏览器剩余 ${fmtBytes(est.quota - est.usage)}` : ''}</span>
      </div>

      <div class="chips" role="group" aria-label="按类别筛选">
        <button class={cat === '' ? 'active' : ''} onClick={() => setCat('')}>全部</button>
        {(Object.keys(CATEGORY_LABEL) as FileCategory[]).map((c) => (
          <button class={cat === c ? 'active' : ''} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>
        ))}
      </div>
      <input type="search" placeholder="按文件名搜索" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />

      {files.length === 0 ? (
        <div class="card empty">
          还没有资料。点上面的“导入”，从手机里选择剑桥真题 PDF 和听力音频。
          <div class="small" style="margin-top:8px">文件只保存在本机，不会上传。</div>
        </div>
      ) : (
        <Grouped files={shown} onEdit={setEditing} />
      )}

      {pending && <ImportDialog files={pending} existing={files} onClose={() => setPending(null)} />}
      {editing && <EditTags file={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// 按“剑桥册号 → Test → 科目”分组，未识别册号的放“未分类”
function Grouped({ files, onEdit }: { files: FileMeta[]; onEdit: (f: FileMeta) => void }) {
  const books = new Map<string, FileMeta[]>();
  for (const f of files) {
    const k = f.book != null ? `剑${f.book}` : '未分类';
    books.set(k, [...(books.get(k) ?? []), f]);
  }
  const keys = [...books.keys()].sort((a, b) => {
    if (a === '未分类') return 1;
    if (b === '未分类') return -1;
    return Number(a.slice(1)) - Number(b.slice(1));
  });
  const skillOrder = ['all', 'listening', 'reading', 'writing', 'speaking'];
  const sortFiles = (list: FileMeta[]) =>
    [...list].sort(
      (a, b) =>
        (a.test ?? 0) - (b.test ?? 0) ||
        skillOrder.indexOf(a.skill ?? '') - skillOrder.indexOf(b.skill ?? '') ||
        (a.section ?? 0) - (b.section ?? 0) ||
        a.name.localeCompare(b.name),
    );

  if (!files.length) return <div class="empty small">没有匹配的文件</div>;
  return (
    <>
      {keys.map((k) => {
        const list = sortFiles(books.get(k)!);
        const tests = new Map<string, FileMeta[]>();
        for (const f of list) {
          const tk = f.test != null ? `Test ${f.test}` : k === '未分类' ? '' : '整本 / 其他';
          tests.set(tk, [...(tests.get(tk) ?? []), f]);
        }
        return (
          <div class="card">
            <h3>{k}</h3>
            {[...tests.entries()].map(([tk, fl]) => (
              <div>
                {tk && <div class="small muted" style="margin-top:6px">{tk}</div>}
                <div class="list">
                  {fl.map((f) => <FileRow file={f} onEdit={onEdit} />)}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function FileRow({ file, onEdit }: { file: FileMeta; onEdit: (f: FileMeta) => void }) {
  const audio = isAudio(file.name, file.mime);
  const open = () => go('/view', audio ? { audio: file.id } : { pdf: file.id });
  return (
    <div class="item row">
      <button class="btn ghost grow" style="justify-content:flex-start;padding:0;text-align:left;min-width:0" onClick={open}>
        <div class="grow" style="min-width:0">
          <div class="ellipsis">{audio ? '🎧 ' : '📄 '}{file.name}</div>
          <div class="small muted ellipsis">
            {CATEGORY_LABEL[file.category]}
            {file.skill && ` · ${SKILL_LABEL[file.skill]}`}
            {file.section != null && ` · Section ${file.section}`}
            {' · '}{fmtBytes(file.size)}
            {file.bookmarks.length > 0 && ` · ${file.bookmarks.length} 个书签`}
          </div>
        </div>
      </button>
      <button class="iconbtn" aria-label="编辑标签" onClick={() => onEdit(file)}><Icon name="edit" /></button>
      <button
        class="iconbtn"
        aria-label="删除"
        onClick={async () => {
          if (!confirm(`删除“${file.name}”？`)) return;
          await deleteFile(file.id);
          toast('已删除');
        }}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}

// ---------------- 标签编辑（导入确认和单个文件共用）----------------
function TagFields({ tags, onChange, audio }: { tags: Tags; onChange: (t: Tags) => void; audio: boolean }) {
  const num = (k: 'book' | 'test' | 'section') => (e: Event) => onChange({ ...tags, [k]: numOrUndef((e.target as HTMLInputElement).value) });
  return (
    <div class="grid2" style="gap:6px">
      <select aria-label="类别" value={tags.category} onChange={(e) => onChange({ ...tags, category: (e.target as HTMLSelectElement).value as FileCategory })}>
        {(Object.keys(CATEGORY_LABEL) as FileCategory[]).map((c) => <option value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select>
      <select aria-label="科目" value={tags.skill ?? ''} onChange={(e) => onChange({ ...tags, skill: ((e.target as HTMLSelectElement).value || undefined) as Tags['skill'] })}>
        <option value="">科目：无</option>
        {['all', 'listening', 'reading', 'writing', 'speaking'].map((s) => <option value={s}>{SKILL_LABEL[s]}</option>)}
      </select>
      <input type="number" inputMode="numeric" aria-label="剑桥册号" placeholder="册号（如 19）" value={tags.book ?? ''} onInput={num('book')} />
      <input type="number" inputMode="numeric" aria-label="Test" placeholder="Test（1–4，整本留空）" value={tags.test ?? ''} onInput={num('test')} />
      {(audio || tags.skill === 'listening') && (
        <input type="number" inputMode="numeric" aria-label="Section" placeholder="Section（1–4）" value={tags.section ?? ''} onInput={num('section')} />
      )}
    </div>
  );
}

type Row = { file: File; tags: Tags; dup?: FileMeta; overwrite: boolean; include: boolean };

function ImportDialog({ files, existing, onClose }: { files: File[]; existing: FileMeta[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(() =>
    files.map((file) => {
      const dup = existing.find((e) => e.name === file.name && e.size === file.size);
      return { file, tags: guessTags(file.name, file.type), dup, overwrite: false, include: true };
    }),
  );
  const [busy, setBusy] = useState<{ done: number; total: number; current: string } | null>(null);
  const update = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toWrite = rows.filter((r) => r.include && (!r.dup || r.overwrite));

  const run = async () => {
    const errors: string[] = [];
    let ok = 0;
    for (let i = 0; i < toWrite.length; i++) {
      const r = toWrite[i];
      setBusy({ done: i, total: toWrite.length, current: r.file.name });
      const meta: FileMeta = {
        id: r.dup?.id ?? uid(),
        name: r.file.name,
        mime: r.file.type || (isPdf(r.file.name, '') ? 'application/pdf' : isAudio(r.file.name, '') ? 'audio/mpeg' : 'application/octet-stream'),
        size: r.file.size,
        ...r.tags,
        bookmarks: r.dup?.bookmarks ?? [],
        importedAt: Date.now(),
      };
      try {
        await saveFile(meta, r.file);
        ok++;
      } catch (e) {
        const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || /quota/i.test(e.message));
        errors.push(`${r.file.name}：${quota ? '存储空间不足，请先删除旧文件' : e instanceof Error ? e.message : '写入失败'}`);
      }
    }
    setBusy(null);
    onClose();
    if (errors.length) {
      alert(`成功导入 ${ok} 个，失败 ${errors.length} 个：\n\n${errors.join('\n')}`);
    } else {
      toast(`已导入 ${ok} 个文件`);
    }
  };

  if (busy) {
    return (
      <Modal title="正在导入" onClose={() => {}}>
        <div class="small ellipsis">{busy.current}</div>
        <div class="progressbar"><div style={{ width: `${(busy.done / busy.total) * 100}%` }} /></div>
        <div class="small muted">{busy.done} / {busy.total}，请不要关闭页面</div>
      </Modal>
    );
  }

  return (
    <Modal title={`确认导入 ${files.length} 个文件`} onClose={onClose}>
      <div class="small muted">已按文件名预填标签，可修改。未识别册号的文件会放在“未分类”。</div>
      {rows.map((r, i) => (
        <div class="card stack" style="padding:10px">
          <label class="row">
            <input type="checkbox" class="check" checked={r.include} onChange={(e) => update(i, { include: (e.target as HTMLInputElement).checked })} />
            <div class="grow" style="min-width:0">
              <div class="ellipsis small"><b>{r.file.name}</b></div>
              <div class="small muted">{fmtBytes(r.file.size)}{r.tags.book != null ? ` · ${refLabel(r.tags)}` : ' · 未分类'}</div>
            </div>
          </label>
          {r.dup && (
            <label class="banner warn row">
              <input type="checkbox" checked={r.overwrite} onChange={(e) => update(i, { overwrite: (e.target as HTMLInputElement).checked })} />
              已导入，是否覆盖？
            </label>
          )}
          {r.include && <TagFields tags={r.tags} audio={isAudio(r.file.name, r.file.type)} onChange={(t) => update(i, { tags: t })} />}
        </div>
      ))}
      <button class="btn primary block" disabled={toWrite.length === 0} onClick={run}>
        导入 {toWrite.length} 个文件
      </button>
    </Modal>
  );
}

function EditTags({ file, onClose }: { file: FileMeta; onClose: () => void }) {
  const [tags, setTags] = useState<Tags>({ category: file.category, book: file.book, test: file.test, skill: file.skill, section: file.section });
  const [marks, setMarks] = useState(file.bookmarks);
  return (
    <Modal title="编辑标签" onClose={onClose}>
      <div class="small ellipsis"><b>{file.name}</b></div>
      <TagFields tags={tags} audio={isAudio(file.name, file.mime)} onChange={setTags} />
      {isPdf(file.name, file.mime) && (
        <div class="stack">
          <div class="small muted">书签（整本书 PDF 用“T1 阅读”“T1 听力”这类名称，今日任务会按它跳转）</div>
          {marks.length === 0 && <div class="small muted">暂无书签，可在阅读器里添加。</div>}
          {marks.map((m, i) => (
            <div class="row">
              <input type="text" aria-label="书签名称" value={m.label} onInput={(e) => setMarks(marks.map((x, j) => (j === i ? { ...x, label: (e.target as HTMLInputElement).value } : x)))} />
              <input type="number" aria-label="页码" style="width:80px" value={m.page} onInput={(e) => setMarks(marks.map((x, j) => (j === i ? { ...x, page: Number((e.target as HTMLInputElement).value) || 1 } : x)))} />
              <button class="iconbtn" aria-label="删除书签" onClick={() => setMarks(marks.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <button
        class="btn primary block"
        onClick={async () => {
          await updateFileMeta(file.id, { ...tags, bookmarks: marks.filter((m) => m.label.trim()) });
          toast('已保存');
          onClose();
        }}
      >
        保存
      </button>
    </Modal>
  );
}
