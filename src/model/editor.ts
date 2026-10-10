import type { Layer, PaletteEntry, Pattern, ThreadId } from './types';
import { createLayer, entriesInUse, getLayer, shiftCells, uid } from './pattern';
import { nextSymbol } from './symbols';

export const HISTORY_LIMIT = 100;

type Change = [key: number, before: number | undefined, after: number | undefined];

type Patch =
  | { t: 'cells'; layerId: string; changes: Change[] }
  | { t: 'move'; layerId: string; dx: number; dy: number }
  | { t: 'layers'; before: Layer[]; after: Layer[]; activeBefore: string; activeAfter: string }
  | { t: 'palette'; before: PaletteEntry[]; after: PaletteEntry[] };

type Entry = Patch[];

export type ChangeEvent =
  | { kind: 'cells'; layerId: string; keys: number[] }
  | { kind: 'all' } // layers, palette or visibility changed: rebuild everything
  | { kind: 'meta' }; // name or active layer: nothing to redraw

type Listener = (e: ChangeEvent) => void;

const shell = (l: Layer): Layer => ({ ...l }); // shares the cells Map on purpose
const copyPalette = (p: PaletteEntry[]): PaletteEntry[] => p.map((e) => ({ ...e }));

/**
 * Owns a pattern and its undo history. Pure TypeScript: no DOM.
 * Every mutation goes through here so history and change events stay consistent.
 */
export class Editor {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private listeners = new Set<Listener>();
  /** Number of history entries pushed since this editor opened (for backup nudges). */
  edits = 0;

  constructor(public pattern: Pattern) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: ChangeEvent): void {
    this.pattern.updatedAt = Date.now();
    for (const l of this.listeners) l(e);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  private push(entry: Entry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.edits++;
  }

  // ---- applying patches ------------------------------------------------

  private apply(p: Patch, dir: 'undo' | 'redo'): ChangeEvent {
    const pat = this.pattern;
    switch (p.t) {
      case 'cells': {
        const cells = getLayer(pat, p.layerId).cells;
        const keys: number[] = [];
        for (const [k, before, after] of p.changes) {
          const v = dir === 'undo' ? before : after;
          if (v === undefined) cells.delete(k); else cells.set(k, v);
          keys.push(k);
        }
        return { kind: 'cells', layerId: p.layerId, keys };
      }
      case 'move': {
        const cells = getLayer(pat, p.layerId).cells;
        const s = dir === 'undo' ? -1 : 1;
        const moved = shiftCells(cells, p.dx * s, p.dy * s);
        cells.clear();
        for (const [k, v] of moved) cells.set(k, v);
        return { kind: 'all' };
      }
      case 'layers':
        pat.layers = (dir === 'undo' ? p.before : p.after).map(shell);
        pat.activeLayerId = dir === 'undo' ? p.activeBefore : p.activeAfter;
        return { kind: 'all' };
      case 'palette':
        pat.palette = copyPalette(dir === 'undo' ? p.before : p.after);
        return { kind: 'all' };
    }
  }

  private run(entry: Entry, dir: 'undo' | 'redo'): void {
    const ordered = dir === 'undo' ? [...entry].reverse() : entry;
    let last: ChangeEvent = { kind: 'meta' };
    for (const p of ordered) last = this.apply(p, dir);
    this.emit(entry.length > 1 ? { kind: 'all' } : last);
  }

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.run(e, 'undo');
    this.redoStack.push(e);
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.run(e, 'redo');
    this.undoStack.push(e);
    return true;
  }

  private commit(entry: Entry): void {
    this.push(entry);
    this.run(entry, 'redo');
  }

  // ---- strokes (pencil, eraser, fill) ------------------------------------

  beginStroke(): Stroke {
    return new Stroke(this, getLayer(this.pattern, this.pattern.activeLayerId));
  }

  /** @internal used by Stroke */
  _strokeEvent(layerId: string, keys: number[]): void {
    this.emit({ kind: 'cells', layerId, keys });
  }

  /** @internal used by Stroke; the cells are already applied. */
  _strokeCommit(layerId: string, changes: Change[]): void {
    if (changes.length) this.push([{ t: 'cells', layerId, changes }]);
  }

  // ---- layers --------------------------------------------------------------

  setActiveLayer(id: string): void {
    if (this.pattern.layers.some((l) => l.id === id)) {
      this.pattern.activeLayerId = id;
      this.emit({ kind: 'meta' });
    }
  }

  private layersPatch(next: Layer[], activeAfter: string): Patch {
    return {
      t: 'layers',
      before: this.pattern.layers.map(shell),
      after: next.map(shell),
      activeBefore: this.pattern.activeLayerId,
      activeAfter,
    };
  }

  private indexOf(id: string): number {
    const i = this.pattern.layers.findIndex((l) => l.id === id);
    if (i < 0) throw new Error('No such layer ' + id);
    return i;
  }

  addLayer(): string {
    const layers = this.pattern.layers;
    let n = layers.length + 1;
    while (layers.some((l) => l.name === `Layer ${n}`)) n++;
    const layer = createLayer(`Layer ${n}`);
    const next = [...layers];
    next.splice(this.indexOf(this.pattern.activeLayerId) + 1, 0, layer);
    this.commit([this.layersPatch(next, layer.id)]);
    return layer.id;
  }

  deleteLayer(id: string): boolean {
    const layers = this.pattern.layers;
    if (layers.length <= 1) return false;
    const i = this.indexOf(id);
    const next = layers.filter((l) => l.id !== id);
    const active = this.pattern.activeLayerId === id
      ? next[Math.min(i, next.length - 1)]!.id
      : this.pattern.activeLayerId;
    this.commit([this.layersPatch(next, active)]);
    return true;
  }

  renameLayer(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.indexOf(id);
    const next = this.pattern.layers.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
    this.commit([this.layersPatch(next, this.pattern.activeLayerId)]);
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.indexOf(id);
    const next = this.pattern.layers.map((l) => (l.id === id ? { ...l, visible } : l));
    this.commit([this.layersPatch(next, this.pattern.activeLayerId)]);
  }

  /** dir +1 raises the layer (towards the top), -1 lowers it. */
  reorderLayer(id: string, dir: 1 | -1): boolean {
    const i = this.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= this.pattern.layers.length) return false;
    const next = [...this.pattern.layers];
    [next[i], next[j]] = [next[j]!, next[i]!];
    this.commit([this.layersPatch(next, this.pattern.activeLayerId)]);
    return true;
  }

  duplicateLayer(id: string): string {
    const i = this.indexOf(id);
    const src = this.pattern.layers[i]!;
    const copy: Layer = { id: uid(), name: `${src.name} copy`, visible: src.visible, cells: new Map(src.cells) };
    const next = [...this.pattern.layers];
    next.splice(i + 1, 0, copy);
    this.commit([this.layersPatch(next, copy.id)]);
    return copy.id;
  }

  /** Upper stitches win where both layers have one. Not possible on the bottom layer. */
  mergeDown(id: string): boolean {
    const i = this.indexOf(id);
    if (i === 0) return false;
    const upper = this.pattern.layers[i]!;
    const lower = this.pattern.layers[i - 1]!;
    const changes: Change[] = [];
    for (const [k, v] of upper.cells) {
      const before = lower.cells.get(k);
      if (before !== v) changes.push([k, before, v]);
    }
    const next = this.pattern.layers.filter((l) => l.id !== id);
    this.commit([
      { t: 'cells', layerId: lower.id, changes },
      this.layersPatch(next, lower.id),
    ]);
    return true;
  }

  /** Shifts the whole layer; stitches pushed past the edge are kept. */
  moveLayer(id: string, dx: number, dy: number): void {
    this.indexOf(id);
    if (dx === 0 && dy === 0) return;
    this.commit([{ t: 'move', layerId: id, dx, dy }]);
  }

  // ---- palette ---------------------------------------------------------------

  /** Returns the entry for a thread, adding it to the palette when new. */
  addThread(thread: ThreadId): PaletteEntry {
    const existing = this.pattern.palette.find((e) => e.thread === thread);
    if (existing) return existing;
    const entry: PaletteEntry = {
      id: this.pattern.nextEntryId,
      thread,
      symbol: nextSymbol(this.pattern.palette.map((e) => e.symbol)),
    };
    this.pattern.nextEntryId++;
    const before = copyPalette(this.pattern.palette);
    this.commit([{ t: 'palette', before, after: copyPalette([...before, entry]) }]);
    return entry;
  }

  /** Recolours every stitch of an entry. Refused when the thread is already in the palette. */
  replaceThread(entryId: number, thread: ThreadId): boolean {
    const pal = this.pattern.palette;
    if (pal.some((e) => e.thread === thread)) return false;
    if (!pal.some((e) => e.id === entryId)) return false;
    this.commit([{
      t: 'palette',
      before: copyPalette(pal),
      after: pal.map((e) => ({ ...e, thread: e.id === entryId ? thread : e.thread })),
    }]);
    return true;
  }

  isEntryInUse(entryId: number): boolean {
    return entriesInUse(this.pattern).has(entryId);
  }

  /** An entry in use cannot be removed. */
  removeEntry(entryId: number): boolean {
    if (this.isEntryInUse(entryId)) return false;
    const pal = this.pattern.palette;
    if (!pal.some((e) => e.id === entryId)) return false;
    this.commit([{ t: 'palette', before: copyPalette(pal), after: copyPalette(pal.filter((e) => e.id !== entryId)) }]);
    return true;
  }

  rename(name: string): void {
    const t = name.trim();
    if (!t) return;
    this.pattern.name = t;
    this.emit({ kind: 'meta' });
  }
}

/** A live, revertable batch of cell changes on one layer. */
export class Stroke {
  private changes = new Map<number, [before: number | undefined, after: number | undefined]>();
  private done = false;

  constructor(private editor: Editor, private layer: Layer) {}

  get size(): number { return this.changes.size; }

  /** Applies at once; returns whether anything changed. */
  set(k: number, value: number | undefined): boolean {
    if (this.done) return false;
    const current = this.layer.cells.get(k);
    if (current === value) return false;
    const prior = this.changes.get(k);
    this.changes.set(k, [prior ? prior[0] : current, value]);
    if (value === undefined) this.layer.cells.delete(k); else this.layer.cells.set(k, value);
    return true;
  }

  /** Call after a batch of set() calls to tell listeners which cells changed. */
  flush(keys: number[]): void {
    if (keys.length) this.editor._strokeEvent(this.layer.id, keys);
  }

  commit(): void {
    if (this.done) return;
    this.done = true;
    const list: Change[] = [];
    for (const [k, [b, a]] of this.changes) if (b !== a) list.push([k, b, a]);
    this.editor._strokeCommit(this.layer.id, list);
  }

  /** Puts everything back as if the stroke never happened. */
  revert(): void {
    if (this.done) return;
    this.done = true;
    const keys: number[] = [];
    for (const [k, [b]] of this.changes) {
      if (b === undefined) this.layer.cells.delete(k); else this.layer.cells.set(k, b);
      keys.push(k);
    }
    this.changes.clear();
    this.flush(keys);
  }
}
