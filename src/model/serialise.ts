import type { Layer, Pattern } from './types';
import { MAX_SIZE, MIN_SIZE } from './types';
import { key, keyX, keyY } from './key';

export const SCHEMA = 1;

export class UnsupportedSchemaError extends Error {}
export class InvalidFileError extends Error {}

/** The exported form: layer cells flattened to [x, y, entry, x, y, entry, ...]. */
export interface PatternFile extends Omit<Pattern, 'layers'> {
  layers: (Omit<Layer, 'cells'> & { cells: number[] })[];
}

export function toFile(p: Pattern): PatternFile {
  return {
    ...p,
    palette: p.palette.map((e) => ({ ...e })),
    layers: p.layers.map((l) => {
      const cells: number[] = [];
      for (const [k, v] of l.cells) cells.push(keyX(k), keyY(k), v);
      return { id: l.id, name: l.name, visible: l.visible, cells };
    }),
  };
}

export function fromFile(data: unknown): Pattern {
  if (typeof data !== 'object' || data === null) throw new InvalidFileError('This is not a pattern file.');
  const d = data as Record<string, unknown>;
  if (typeof d.schema !== 'number') throw new InvalidFileError('This is not a pattern file.');
  if (d.schema > SCHEMA) {
    throw new UnsupportedSchemaError('This pattern was made with a newer version of the app. Update the app and try again.');
  }
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidFileError(`Bad ${name} in pattern file.`);
    return v;
  };
  const width = num(d.width, 'width'), height = num(d.height, 'height');
  if (width < MIN_SIZE || width > MAX_SIZE || height < MIN_SIZE || height > MAX_SIZE) {
    throw new InvalidFileError('Pattern size is out of range.');
  }
  if (!Array.isArray(d.layers) || d.layers.length === 0 || !Array.isArray(d.palette)) {
    throw new InvalidFileError('Pattern file is incomplete.');
  }

  const palette = (d.palette as Record<string, unknown>[]).map((e) => ({
    id: num(e.id, 'palette id'), thread: String(e.thread), symbol: String(e.symbol),
  }));
  const ids = new Set(palette.map((e) => e.id));
  const layers: Layer[] = (d.layers as Record<string, unknown>[]).map((l) => {
    const flat = l.cells;
    if (!Array.isArray(flat) || flat.length % 3 !== 0) throw new InvalidFileError('Layer data is damaged.');
    const cells = new Map<number, number>();
    for (let i = 0; i < flat.length; i += 3) {
      const v = num(flat[i + 2], 'stitch');
      if (!ids.has(v)) throw new InvalidFileError('A stitch uses a thread that is not in the palette.');
      cells.set(key(num(flat[i], 'stitch'), num(flat[i + 1], 'stitch')), v);
    }
    return { id: String(l.id), name: String(l.name), visible: l.visible !== false, cells };
  });
  const active = String(d.activeLayerId);
  const now = Date.now();
  return {
    schema: 1,
    id: String(d.id),
    name: String(d.name ?? 'Untitled pattern'),
    width, height,
    fabric: typeof d.fabric === 'string' ? d.fabric : '#F4ECD8',
    palette,
    layers,
    activeLayerId: layers.some((l) => l.id === active) ? active : layers[layers.length - 1]!.id,
    nextEntryId: Math.max(typeof d.nextEntryId === 'number' ? d.nextEntryId : 1, ...palette.map((e) => e.id + 1), 1),
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : now,
  };
}
