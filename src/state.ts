import { signal } from '@preact/signals';
import { Editor } from './model/editor';
import { createPattern, uid } from './model/pattern';
import type { Pattern } from './model/types';
import { Autosaver } from './storage/autosave';
import { deletePattern, loadIndex, loadPattern, savePattern, type IndexEntry } from './storage/db';
import { lastTool } from './settings';
import { renderThumbnail } from './canvas/export';

export interface Session {
  editor: Editor;
  saver: Autosaver;
}

export const session = signal<Session | null>(null);
export const gallery = signal<IndexEntry[] | null>(null);
/** Bumped on every model change so components that read the pattern re-render. */
export const revision = signal(0);
export const selectedEntry = signal<number | undefined>(undefined);
export const toast = signal<{ text: string; id: number } | null>(null);
export const updateReady = signal<(() => void) | null>(null);

let toastId = 0;
export function showToast(text: string): void {
  const id = ++toastId;
  toast.value = { text, id };
  setTimeout(() => { if (toast.value?.id === id) toast.value = null; }, 2800);
}

export async function refreshGallery(): Promise<void> {
  gallery.value = await loadIndex();
}

function startSession(pattern: Pattern): void {
  const editor = new Editor(pattern);
  const saver = new Autosaver(editor);
  editor.subscribe(() => { revision.value++; });
  const active = pattern.palette[0];
  selectedEntry.value = active?.id;
  if (lastTool.value === 'move' || lastTool.value === 'eyedropper') lastTool.value = 'pencil';
  session.value = { editor, saver };
}

export async function openPattern(id: string): Promise<void> {
  const p = await loadPattern(id);
  if (!p) throw new Error('That pattern could not be found.');
  startSession(p);
}

/** Saves a new pattern immediately so it appears in the gallery even before the first edit. */
export async function createAndOpen(name: string, width: number, height: number): Promise<void> {
  const p = createPattern({ name, width, height });
  await savePattern(p, { thumb: renderThumbnail(p) });
  startSession(p);
}

export async function closeEditor(): Promise<void> {
  const s = session.value;
  if (!s) return;
  await s.saver.dispose();
  session.value = null;
  await refreshGallery();
}

export async function addImported(p: Pattern): Promise<void> {
  await savePattern(p, { thumb: renderThumbnail(p) });
  await refreshGallery();
}

export async function duplicatePattern(id: string): Promise<void> {
  const p = await loadPattern(id);
  if (!p) return;
  const copy: Pattern = {
    ...p,
    id: uid(),
    name: `${p.name} copy`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    palette: p.palette.map((e) => ({ ...e })),
    layers: p.layers.map((l) => ({ ...l, id: l.id, cells: new Map(l.cells) })),
  };
  await addImported(copy);
}

export async function removePattern(id: string): Promise<void> {
  await deletePattern(id);
  await refreshGallery();
}
