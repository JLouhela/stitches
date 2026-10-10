import { key } from './key';
import type { Pattern } from './types';
import { activeLayer, inBounds } from './pattern';

/** Bresenham line, inclusive of both ends. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/**
 * Cells of the 4-connected region around (x, y) on the active layer that share the
 * value found there (an entry id, or empty), bounded by the pattern edge.
 */
export function fillRegion(p: Pattern, x: number, y: number): number[] {
  if (!inBounds(p, x, y)) return [];
  const cells = activeLayer(p).cells;
  const target = cells.get(key(x, y));
  const seen = new Uint8Array(p.width * p.height);
  const out: number[] = [];
  const stack: number[] = [x, y];
  while (stack.length) {
    const cy = stack.pop()!, cx = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= p.width || cy >= p.height) continue;
    const idx = cy * p.width + cx;
    if (seen[idx]) continue;
    seen[idx] = 1;
    const k = key(cx, cy);
    if (cells.get(k) !== target) continue;
    out.push(k);
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return out;
}
