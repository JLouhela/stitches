import { createStore, del, get, set } from 'idb-keyval';
import type { Pattern } from '../model/types';
import { fromFile, toFile, type PatternFile } from '../model/serialise';

// Every project under <user>.github.io shares one origin, so name things carefully.
let store: ReturnType<typeof createStore> | undefined;
const kv = () => (store ??= createStore('xstitch', 'kv'));

export interface IndexEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  thumb?: string; // data URL
  exportedAt?: number;
  /** Edits made since the last export, for the backup nudge. */
  editsSinceExport: number;
}

const patternKey = (id: string) => `pattern:${id}`;

export async function loadIndex(): Promise<IndexEntry[]> {
  return ((await get<IndexEntry[]>('index', kv())) ?? []).slice();
}

async function saveIndex(list: IndexEntry[]): Promise<void> {
  await set('index', list, kv());
}

export async function loadPattern(id: string): Promise<Pattern | undefined> {
  const raw = await get<Pattern>(patternKey(id), kv());
  if (!raw) return undefined;
  // Structured clone keeps Maps; run the schema check on the way in.
  if (raw.schema > 1) throw new Error('This pattern was made with a newer version of the app. Update the app and try again.');
  return raw;
}

/** Writes a pattern and updates its index row. Never writes a pattern that failed to load. */
export async function savePattern(p: Pattern, extras: { thumb?: string; addEdits?: number } = {}): Promise<void> {
  await set(patternKey(p.id), p, kv());
  const index = await loadIndex();
  const i = index.findIndex((e) => e.id === p.id);
  const prev = i >= 0 ? index[i] : undefined;
  const row: IndexEntry = {
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    thumb: extras.thumb ?? prev?.thumb,
    exportedAt: prev?.exportedAt,
    editsSinceExport: (prev?.editsSinceExport ?? 0) + (extras.addEdits ?? 0),
  };
  if (i >= 0) index[i] = row; else index.unshift(row);
  await saveIndex(index);
}

export async function deletePattern(id: string): Promise<void> {
  await del(patternKey(id), kv());
  await saveIndex((await loadIndex()).filter((e) => e.id !== id));
}

export async function markExported(id: string): Promise<void> {
  const index = await loadIndex();
  const row = index.find((e) => e.id === id);
  if (!row) return;
  row.exportedAt = Date.now();
  row.editsSinceExport = 0;
  await saveIndex(index);
}

export const needsBackup = (e: IndexEntry): boolean => !e.exportedAt || e.updatedAt > e.exportedAt;

/** Imports always create a new pattern with a new id. */
export function reidentify(p: Pattern, id: string): Pattern {
  return { ...p, id, createdAt: Date.now(), updatedAt: Date.now() };
}

export async function persistStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not available */ }
}

export { fromFile, toFile };
export type { PatternFile };
