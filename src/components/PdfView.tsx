import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getFileBlob, getFileMeta, updateFileMeta } from '../db';
import type { FileMeta } from '../types';
import { Icon, Modal, toast } from '../ui';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const ASSETS = new URL('pdfjs/', document.baseURI).href;

const DOC_OPTIONS = {
  cMapUrl: ASSETS + 'cmaps/',
  cMapPacked: true,
  standardFontDataUrl: ASSETS + 'standard_fonts/',
  wasmUrl: ASSETS + 'wasm/',
  iccUrl: ASSETS + 'iccs/',
};
const SMALL_PDF = 32 * 1024 * 1024;

// 小文件整块读入；大文件不整块读入内存，按 pdf.js 请求的范围从 Blob 切片读取
async function openPdf(blob: Blob): Promise<PDFDocumentLoadingTask> {
  if (blob.size <= SMALL_PDF) {
    return pdfjs.getDocument({ ...DOC_OPTIONS, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const chunk = 1 << 20;
  const initial = new Uint8Array(await blob.slice(0, chunk).arrayBuffer());
  const range = new pdfjs.PDFDataRangeTransport(blob.size, initial);
  range.requestDataRange = (begin: number, end: number) => {
    blob.slice(begin, end).arrayBuffer().then((buf) => range.onDataRange(begin, new Uint8Array(buf)));
  };
  return pdfjs.getDocument({ ...DOC_OPTIONS, range, disableAutoFetch: true, disableStream: true, rangeChunkSize: chunk });
}

const MAX_CANVAS_PIXELS = 12_000_000;

export function PdfView({ fileId, initialPage }: { fileId: string; initialPage?: number }) {
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [showMarks, setShowMarks] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [width, setWidth] = useState(0);

  // 加载文件
  useEffect(() => {
    let alive = true;
    let task: PDFDocumentLoadingTask | null = null;
    setDoc(null);
    setError('');
    (async () => {
      const m = await getFileMeta(fileId);
      const blob = await getFileBlob(fileId);
      if (!alive) return;
      if (!m || !blob) { setError('文件不存在，可能已被删除'); return; }
      setMeta(m);
      try {
        task = await openPdf(blob);
        if (!alive) { void task.destroy(); return; }
        const loaded = await task.promise;
        if (!alive) return;
        const start = Math.min(loaded.numPages, Math.max(1, initialPage ?? m.lastPage ?? 1));
        setPage(start);
        setDoc(loaded);
      } catch (e) {
        if (alive) setError(`无法打开 PDF：${e instanceof Error ? e.message : e}`);
      }
    })();
    return () => { alive = false; void task?.destroy(); };
  }, [fileId, initialPage]);

  // 容器宽度
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 渲染当前页
  useEffect(() => {
    if (!doc || !width) return;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page).catch((e) => { console.error('PDF 取页失败', e); return null; });
      if (!p) return;
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const cssScale = ((width - 0) / base.width) * zoom;
      let dpr = window.devicePixelRatio || 1;
      const px = base.width * base.height * cssScale * cssScale * dpr * dpr;
      if (px > MAX_CANVAS_PIXELS) dpr *= Math.sqrt(MAX_CANVAS_PIXELS / px);
      const vp = p.getViewport({ scale: cssScale * dpr });
      const canvas = canvasRef.current!;
      renderTask.current?.cancel();
      const off = document.createElement('canvas');
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      const task = p.render({ canvas: off, canvasContext: off.getContext('2d')!, viewport: vp });
      renderTask.current = task;
      try {
        await task.promise;
      } catch (e) {
        if (!(e instanceof Error && e.name === 'RenderingCancelledException')) console.error('PDF 渲染失败', e);
        return;
      }
      if (cancelled) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.style.width = `${vp.width / dpr}px`;
      canvas.style.height = `${vp.height / dpr}px`;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
      if (stageRef.current) stageRef.current.style.transform = '';
    })();
    return () => { cancelled = true; };
  }, [doc, page, zoom, width]);

  // 记住上次阅读页
  useEffect(() => {
    setPageInput(String(page));
    if (!doc) return;
    const t = setTimeout(() => updateFileMeta(fileId, { lastPage: page }), 500);
    return () => clearTimeout(t);
  }, [page, doc, fileId]);

  const n = doc?.numPages ?? 0;
  const goPage = (p: number) => {
    if (!n) return;
    const next = Math.min(n, Math.max(1, p));
    if (next !== page) {
      setPage(next);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  };

  // 手势：单指左右滑动翻页（未放大时），双指缩放
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let sx = 0, sy = 0, st = 0, single = false;
    let pinchStart = 0, pinchScale = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        single = true;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
      } else if (e.touches.length === 2) {
        single = false;
        pinchStart = dist(e.touches);
        pinchScale = 1;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart) {
        e.preventDefault();
        pinchScale = dist(e.touches) / pinchStart;
        const target = Math.min(4, Math.max(1, zoom * pinchScale));
        if (stageRef.current) stageRef.current.style.transform = `scale(${target / zoom})`;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (pinchStart && e.touches.length < 2) {
        const target = Math.min(4, Math.max(1, zoom * pinchScale));
        pinchStart = 0;
        if (Math.abs(target - zoom) > 0.05) setZoom(Math.round(target * 20) / 20);
        else if (stageRef.current) stageRef.current.style.transform = '';
        return;
      }
      if (single && e.changedTouches.length === 1 && zoom === 1) {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && Date.now() - st < 600) goPage(page + (dx < 0 ? 1 : -1));
      }
      single = false;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  });

  const addMark = async (label: string) => {
    if (!meta) return;
    const bookmarks = [...meta.bookmarks.filter((b) => b.label !== label), { label, page }].sort((a, b) => a.page - b.page);
    await updateFileMeta(fileId, { bookmarks });
    setMeta({ ...meta, bookmarks });
    toast(`已添加书签：${label}（第 ${page} 页）`);
  };
  const removeMark = async (label: string) => {
    if (!meta) return;
    const bookmarks = meta.bookmarks.filter((b) => b.label !== label);
    await updateFileMeta(fileId, { bookmarks });
    setMeta({ ...meta, bookmarks });
  };

  return (
    <div class="pane">
      <div class="pdf-scroll" ref={scrollRef}>
        {error ? (
          <div class="empty">{error}</div>
        ) : !doc ? (
          <div class="empty">正在打开…</div>
        ) : null}
        <div class="pdf-stage" ref={stageRef} style={{ display: doc ? '' : 'none' }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div class="pdf-bar">
        <button class="iconbtn" aria-label="上一页" disabled={page <= 1} onClick={() => goPage(page - 1)}><Icon name="left" /></button>
        <input
          type="number"
          inputMode="numeric"
          aria-label="页码"
          value={pageInput}
          onInput={(e) => setPageInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && goPage(Number(pageInput) || page)}
          onBlur={() => goPage(Number(pageInput) || page)}
        />
        <span class="small muted">/ {n || '—'}</span>
        <button class="iconbtn" aria-label="下一页" disabled={page >= n} onClick={() => goPage(page + 1)}><Icon name="right" /></button>
        <div class="grow" />
        {zoom !== 1 && <button class="btn small ghost" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>}
        <button class="iconbtn" aria-label="书签" onClick={() => setShowMarks(true)}><Icon name="bookmark" /></button>
      </div>
      {showMarks && meta && (
        <Bookmarks
          meta={meta}
          page={page}
          onAdd={addMark}
          onRemove={removeMark}
          onJump={(p) => { goPage(p); setShowMarks(false); }}
          onClose={() => setShowMarks(false)}
        />
      )}
    </div>
  );
}

function Bookmarks(props: {
  meta: FileMeta;
  page: number;
  onAdd: (label: string) => void;
  onRemove: (label: string) => void;
  onJump: (page: number) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const quick = ['T1 听力', 'T1 阅读', 'T1 写作', '阅读 P1', '阅读 P2', '阅读 P3', '答案'];
  return (
    <Modal title="书签" onClose={props.onClose}>
      <div class="row">
        <input type="text" placeholder={`第 ${props.page} 页的书签名称`} value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
        <button class="btn primary" onClick={() => { props.onAdd(label.trim() || `第 ${props.page} 页`); setLabel(''); }}>添加</button>
      </div>
      <div class="chips">
        {quick.map((q) => <button onClick={() => setLabel(q)}>{q}</button>)}
      </div>
      <div class="small muted">整本书 PDF 请用“T1 阅读”“T2 听力”这类名称，今日任务会按它跳转。</div>
      {props.meta.bookmarks.length === 0 && <div class="empty small">还没有书签</div>}
      <div class="list">
        {props.meta.bookmarks.map((b) => (
          <div class="item row">
            <button class="btn ghost grow" style="justify-content:flex-start" onClick={() => props.onJump(b.page)}>
              {b.label} <span class="muted small">· 第 {b.page} 页</span>
            </button>
            <button class="iconbtn" aria-label={`删除书签 ${b.label}`} onClick={() => props.onRemove(b.label)}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
