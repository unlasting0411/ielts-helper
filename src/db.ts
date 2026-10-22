import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FileBlob, FileMeta, Mistake, Progress, Score, Settings, Synonym } from './types';

interface Schema extends DBSchema {
  fileBlobs: { key: string; value: FileBlob };
  files: { key: string; value: FileMeta; indexes: { category: string; book_test: [number, number] } };
  settings: { key: string; value: Settings };
  progress: { key: string; value: Progress; indexes: { day: number } };
  scores: { key: string; value: Score };
  mistakes: { key: string; value: Mistake; indexes: { createdAt: number; cause: string } };
  synonyms: { key: string; value: Synonym };
}

export type StoreName = 'fileBlobs' | 'files' | 'settings' | 'progress' | 'scores' | 'mistakes' | 'synonyms';

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('ielts-helper', 1, {
      upgrade(d) {
        d.createObjectStore('fileBlobs', { keyPath: 'id' });
        const files = d.createObjectStore('files', { keyPath: 'id' });
        files.createIndex('category', 'category');
        files.createIndex('book_test', ['book', 'test']);
        d.createObjectStore('settings', { keyPath: 'id' });
        const progress = d.createObjectStore('progress', { keyPath: 'id' });
        progress.createIndex('day', 'day');
        d.createObjectStore('scores', { keyPath: 'id' });
        const mistakes = d.createObjectStore('mistakes', { keyPath: 'id' });
        mistakes.createIndex('createdAt', 'createdAt');
        mistakes.createIndex('cause', 'cause');
        d.createObjectStore('synonyms', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---- 通知：数据变化后让页面刷新 ----
type Listener = (store: StoreName) => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(store: StoreName) {
  listeners.forEach((fn) => fn(store));
}

// ---- 通用读写 ----
export async function getAll<S extends Exclude<StoreName, 'fileBlobs'>>(store: S): Promise<Schema[S]['value'][]> {
  return (await db()).getAll(store);
}
export async function put<S extends StoreName>(store: S, value: Schema[S]['value']): Promise<void> {
  await (await db()).put(store, value as never);
  emit(store);
}
export async function del(store: StoreName, id: string): Promise<void> {
  await (await db()).delete(store, id);
  emit(store);
}

// ---- 设置 ----
export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  startDate: todayISO(),
  examMode: 'undecided',
  dailyHours: 6,
};

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getSettings(): Promise<Settings | undefined> {
  return (await db()).get('settings', 'main');
}

// ---- 进度 ----
export async function setTaskDone(day: number, taskKey: string, done: boolean): Promise<void> {
  const p: Progress = { id: `${day}-${taskKey}`, day, taskKey, done, doneAt: done ? Date.now() : undefined };
  await put('progress', p);
}

// ---- 文件 ----
export async function getFileBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('fileBlobs', id))?.blob;
}

export async function getFileMeta(id: string): Promise<FileMeta | undefined> {
  return (await db()).get('files', id);
}

export async function updateFileMeta(id: string, patch: Partial<FileMeta>): Promise<void> {
  const d = await db();
  const cur = await d.get('files', id);
  if (!cur) return;
  await d.put('files', { ...cur, ...patch });
  emit('files');
}

// 先写 blob，成功后再写元数据；失败时回滚 blob
export async function saveFile(meta: FileMeta, blob: Blob): Promise<void> {
  const d = await db();
  await d.put('fileBlobs', { id: meta.id, blob });
  try {
    await d.put('files', meta);
  } catch (e) {
    await d.delete('fileBlobs', meta.id).catch(() => {});
    throw e;
  }
  emit('files');
}

export async function deleteFile(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['files', 'fileBlobs'], 'readwrite');
  await Promise.all([tx.objectStore('files').delete(id), tx.objectStore('fileBlobs').delete(id), tx.done]);
  emit('files');
}

// ---- 全部清空 ----
export async function clearAll(): Promise<void> {
  const d = await db();
  const names: StoreName[] = ['fileBlobs', 'files', 'settings', 'progress', 'scores', 'mistakes', 'synonyms'];
  const tx = d.transaction(names, 'readwrite');
  await Promise.all([...names.map((n) => tx.objectStore(n).clear()), tx.done]);
  names.forEach(emit);
}

// ---- 导出 / 导入（不含文件 Blob）----
export type ExportData = {
  app: 'ielts-helper';
  version: 1;
  exportedAt: string;
  settings: Settings[];
  progress: Progress[];
  scores: Score[];
  mistakes: Mistake[];
  synonyms: Synonym[];
};

export async function exportData(): Promise<ExportData> {
  const d = await db();
  return {
    app: 'ielts-helper',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await d.getAll('settings'),
    progress: await d.getAll('progress'),
    scores: await d.getAll('scores'),
    mistakes: await d.getAll('mistakes'),
    synonyms: await d.getAll('synonyms'),
  };
}

// 导入：同 id 覆盖，其余保留
export async function importData(data: ExportData): Promise<number> {
  if (!data || data.app !== 'ielts-helper') throw new Error('不是本 App 导出的数据文件');
  const d = await db();
  const names = ['settings', 'progress', 'scores', 'mistakes', 'synonyms'] as const;
  const tx = d.transaction(names, 'readwrite');
  let count = 0;
  for (const n of names) {
    for (const row of (data[n] ?? []) as never[]) {
      tx.objectStore(n).put(row);
      count++;
    }
  }
  await tx.done;
  names.forEach(emit);
  return count;
}
