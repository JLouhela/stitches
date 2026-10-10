import { DEFAULT_FABRIC, DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, type Layer, type Pattern } from './types';
import { key, keyX, keyY } from './key';

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export const clampSize = (n: number): number =>
  Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(Number.isFinite(n) ? n : DEFAULT_SIZE)));

export function createLayer(name: string): Layer {
  return { id: uid(), name, visible: true, cells: new Map() };
}

export function createPattern(opts: { name?: string; width?: number; height?: number } = {}): Pattern {
  const layer = createLayer('Layer 1');
  const now = Date.now();
  return {
    schema: 1,
    id: uid(),
    name: opts.name?.trim() || 'Untitled pattern',
    width: clampSize(opts.width ?? DEFAULT_SIZE),
    height: clampSize(opts.height ?? DEFAULT_SIZE),
    fabric: DEFAULT_FABRIC,
    palette: [],
    layers: [layer],
    activeLayerId: layer.id,
    nextEntryId: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export const inBounds = (p: Pattern, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < p.width && y < p.height;

export const keyInBounds = (p: Pattern, k: number): boolean => inBounds(p, keyX(k), keyY(k));

export function getLayer(p: Pattern, id: string): Layer {
  const l = p.layers.find((l) => l.id === id);
  if (!l) throw new Error('No such layer ' + id);
  return l;
}

export const activeLayer = (p: Pattern): Layer => getLayer(p, p.activeLayerId);

/** Topmost visible layer's entry at a cell, or undefined. */
export function compositeAt(p: Pattern, x: number, y: number): number | undefined {
  if (!inBounds(p, x, y)) return undefined;
  const k = key(x, y);
  for (let i = p.layers.length - 1; i >= 0; i--) {
    const l = p.layers[i]!;
    if (!l.visible) continue;
    const v = l.cells.get(k);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** All visible in-bounds stitches, topmost layer winning. */
export function composite(p: Pattern): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of p.layers) {
    if (!l.visible) continue;
    for (const [k, v] of l.cells) if (keyInBounds(p, k)) out.set(k, v);
  }
  return out;
}

/** Stitch count per palette entry id, from the composite. */
export function countByEntry(p: Pattern): Map<number, number> {
  const counts = new Map<number, number>();
  for (const v of composite(p).values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

/** Entry ids used anywhere in any layer (including hidden and off-canvas stitches). */
export function entriesInUse(p: Pattern): Set<number> {
  const used = new Set<number>();
  for (const l of p.layers) for (const v of l.cells.values()) used.add(v);
  return used;
}

export function layerHasOffCanvas(p: Pattern, l: Layer): boolean {
  for (const k of l.cells.keys()) if (!keyInBounds(p, k)) return true;
  return false;
}

/** Returns a new map with every key shifted by (dx, dy). */
export function shiftCells(cells: Map<number, number>, dx: number, dy: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [k, v] of cells) out.set(key(keyX(k) + dx, keyY(k) + dy), v);
  return out;
}
