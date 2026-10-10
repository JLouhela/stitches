import { describe, expect, it } from 'vitest';
import { Editor } from './editor';
import { key } from './key';
import { activeLayer, composite, compositeAt, countByEntry, createPattern, layerHasOffCanvas } from './pattern';
import { fillRegion, lineCells } from './tools';
import { fromFile, InvalidFileError, toFile, UnsupportedSchemaError } from './serialise';
import { THREADS, contrastText, searchThreads } from './threads';

function setup(w = 20, h = 20) {
  const ed = new Editor(createPattern({ width: w, height: h }));
  const a = ed.addThread('dmc:310').id;
  const b = ed.addThread('dmc:321').id;
  return { ed, a, b };
}

function paint(ed: Editor, cells: [number, number][], v: number | undefined) {
  const s = ed.beginStroke();
  const keys: number[] = [];
  for (const [x, y] of cells) if (s.set(key(x, y), v)) keys.push(key(x, y));
  s.flush(keys);
  s.commit();
}

describe('paint, erase, undo, redo', () => {
  it('paints and erases on the active layer', () => {
    const { ed, a } = setup();
    paint(ed, [[1, 1], [2, 1]], a);
    expect(compositeAt(ed.pattern, 1, 1)).toBe(a);
    paint(ed, [[1, 1]], undefined);
    expect(compositeAt(ed.pattern, 1, 1)).toBeUndefined();
    expect(compositeAt(ed.pattern, 2, 1)).toBe(a);
  });

  it('undo and redo restore exact state', () => {
    const { ed, a, b } = setup();
    paint(ed, [[0, 0]], a);
    paint(ed, [[0, 0], [1, 0]], b);
    ed.undo();
    expect(compositeAt(ed.pattern, 0, 0)).toBe(a);
    expect(compositeAt(ed.pattern, 1, 0)).toBeUndefined();
    ed.undo();
    expect(composite(ed.pattern).size).toBe(0);
    while (ed.undo()) { /* palette additions from setup */ }
    expect(ed.pattern.palette.length).toBe(0);
    while (ed.redo()) { /* replay everything */ }
    ed.undo(); ed.undo();
    ed.redo();
    ed.redo();
    expect(compositeAt(ed.pattern, 0, 0)).toBe(b);
    expect(ed.canRedo).toBe(false);
  });

  it('a new action clears redo', () => {
    const { ed, a } = setup();
    paint(ed, [[0, 0]], a);
    ed.undo();
    paint(ed, [[1, 1]], a);
    expect(ed.canRedo).toBe(false);
  });

  it('reverted stroke leaves nothing behind and no history', () => {
    const { ed, a, b } = setup();
    paint(ed, [[3, 3]], a);
    const before = ed.edits;
    const s = ed.beginStroke();
    s.set(key(3, 3), b);
    s.set(key(4, 4), b);
    s.revert();
    expect(compositeAt(ed.pattern, 3, 3)).toBe(a);
    expect(compositeAt(ed.pattern, 4, 4)).toBeUndefined();
    expect(ed.edits).toBe(before);
  });

  it('caps history at 100 steps', () => {
    const { ed, a } = setup();
    for (let i = 0; i < 120; i++) paint(ed, [[i % 20, Math.floor(i / 20)]], a);
    let n = 0;
    while (ed.undo()) n++;
    expect(n).toBe(100);
  });
});

describe('fill and lines', () => {
  it('fills a bounded 4-connected region', () => {
    const { ed, a } = setup(10, 10);
    paint(ed, Array.from({ length: 10 }, (_, y) => [5, y] as [number, number]), a);
    const region = fillRegion(ed.pattern, 0, 0);
    expect(region.length).toBe(50);
    expect(region).not.toContain(key(5, 0));
  });

  it('fill does not leak diagonally', () => {
    const { ed, a } = setup(10, 10);
    paint(ed, [[1, 0], [0, 1]], a);
    expect(fillRegion(ed.pattern, 0, 0)).toEqual([key(0, 0)]);
  });

  it('fill of a painted region follows its colour only', () => {
    const { ed, a, b } = setup(10, 10);
    paint(ed, [[0, 0], [1, 0], [2, 0]], a);
    paint(ed, [[1, 0]], b);
    expect(fillRegion(ed.pattern, 0, 0)).toEqual([key(0, 0)]);
  });

  it('line covers a gap between samples', () => {
    const cells = lineCells(0, 0, 5, 2);
    expect(cells[0]).toEqual([0, 0]);
    expect(cells[cells.length - 1]).toEqual([5, 2]);
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i]![0] - cells[i - 1]![0])).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i]![1] - cells[i - 1]![1])).toBeLessThanOrEqual(1);
    }
  });
});

describe('layers', () => {
  it('composite takes the topmost visible layer', () => {
    const { ed, a, b } = setup();
    paint(ed, [[0, 0], [1, 0]], a);
    ed.addLayer();
    paint(ed, [[0, 0]], b);
    expect(compositeAt(ed.pattern, 0, 0)).toBe(b);
    expect(compositeAt(ed.pattern, 1, 0)).toBe(a);
    ed.setLayerVisible(ed.pattern.activeLayerId, false);
    expect(compositeAt(ed.pattern, 0, 0)).toBe(a);
    expect(countByEntry(ed.pattern).get(a)).toBe(2);
  });

  it('move keeps off-canvas stitches and brings them back', () => {
    const { ed, a } = setup(10, 10);
    paint(ed, [[8, 5], [9, 5]], a);
    const id = ed.pattern.activeLayerId;
    ed.moveLayer(id, 3, 0);
    expect(composite(ed.pattern).size).toBe(0);
    expect(layerHasOffCanvas(ed.pattern, activeLayer(ed.pattern))).toBe(true);
    ed.moveLayer(id, -3, 0);
    expect(compositeAt(ed.pattern, 8, 5)).toBe(a);
    expect(compositeAt(ed.pattern, 9, 5)).toBe(a);
  });

  it('move is one undo step', () => {
    const { ed, a } = setup(10, 10);
    paint(ed, [[2, 2]], a);
    ed.moveLayer(ed.pattern.activeLayerId, 2, -1);
    expect(compositeAt(ed.pattern, 4, 1)).toBe(a);
    ed.undo();
    expect(compositeAt(ed.pattern, 2, 2)).toBe(a);
    ed.redo();
    expect(compositeAt(ed.pattern, 4, 1)).toBe(a);
  });

  it('moving one layer does not disturb another', () => {
    const { ed, a, b } = setup(10, 10);
    paint(ed, [[1, 1]], a);
    const bottom = ed.pattern.activeLayerId;
    ed.addLayer();
    paint(ed, [[1, 1]], b);
    ed.moveLayer(ed.pattern.activeLayerId, 4, 4);
    expect(compositeAt(ed.pattern, 1, 1)).toBe(a);
    expect(compositeAt(ed.pattern, 5, 5)).toBe(b);
    expect(ed.pattern.layers[0]!.id).toBe(bottom);
  });

  it('merge down: upper wins, undo restores both layers', () => {
    const { ed, a, b } = setup();
    paint(ed, [[0, 0], [1, 0]], a);
    ed.addLayer();
    paint(ed, [[1, 0], [2, 0]], b);
    const upperId = ed.pattern.activeLayerId;
    expect(ed.mergeDown(upperId)).toBe(true);
    expect(ed.pattern.layers.length).toBe(1);
    expect(compositeAt(ed.pattern, 1, 0)).toBe(b);
    expect(compositeAt(ed.pattern, 0, 0)).toBe(a);
    ed.undo();
    expect(ed.pattern.layers.length).toBe(2);
    expect(ed.pattern.layers[0]!.cells.get(key(1, 0))).toBe(a);
    expect(ed.pattern.layers[0]!.cells.has(key(2, 0))).toBe(false);
    expect(ed.pattern.layers[1]!.cells.get(key(1, 0))).toBe(b);
    ed.redo();
    expect(ed.pattern.layers.length).toBe(1);
  });

  it('cannot merge the bottom layer or delete the last one', () => {
    const { ed } = setup();
    expect(ed.mergeDown(ed.pattern.layers[0]!.id)).toBe(false);
    expect(ed.deleteLayer(ed.pattern.layers[0]!.id)).toBe(false);
  });

  it('duplicate, reorder, rename, delete are undoable', () => {
    const { ed, a } = setup();
    paint(ed, [[0, 0]], a);
    const first = ed.pattern.layers[0]!.id;
    const dup = ed.duplicateLayer(first);
    expect(ed.pattern.layers.map((l) => l.id)).toEqual([first, dup]);
    paint(ed, [[1, 1]], a); // on the duplicate, which is now active
    expect(ed.pattern.layers[0]!.cells.has(key(1, 1))).toBe(false);
    ed.reorderLayer(dup, -1);
    expect(ed.pattern.layers[0]!.id).toBe(dup);
    ed.renameLayer(dup, 'Flowers');
    expect(ed.pattern.layers[0]!.name).toBe('Flowers');
    ed.deleteLayer(dup);
    expect(ed.pattern.layers.length).toBe(1);
    ed.undo(); // delete
    ed.undo(); // rename
    expect(ed.pattern.layers[0]!.name).toBe('Layer 1 copy');
    ed.undo(); // reorder
    ed.undo(); // paint on duplicate
    expect(ed.pattern.layers[1]!.cells.has(key(1, 1))).toBe(false);
    ed.undo(); // duplicate
    expect(ed.pattern.layers.length).toBe(1);
  });

  it('add layer goes above the active one and becomes active', () => {
    const { ed } = setup();
    const top = ed.addLayer();
    ed.setActiveLayer(ed.pattern.layers[0]!.id);
    const mid = ed.addLayer();
    expect(ed.pattern.layers.map((l) => l.id)).toEqual([ed.pattern.layers[0]!.id, mid, top]);
    expect(ed.pattern.activeLayerId).toBe(mid);
  });
});

describe('palette', () => {
  it('ids are never reused and entries in use cannot be removed', () => {
    const { ed, a, b } = setup();
    paint(ed, [[0, 0]], a);
    expect(ed.removeEntry(a)).toBe(false);
    expect(ed.removeEntry(b)).toBe(true);
    const c = ed.addThread('dmc:333').id;
    expect(c).toBeGreaterThan(b);
  });

  it('replacing a thread recolours every stitch at once', () => {
    const { ed, a } = setup();
    paint(ed, [[0, 0], [1, 1]], a);
    expect(ed.replaceThread(a, 'dmc:666')).toBe(true);
    expect(ed.pattern.palette.find((e) => e.id === a)!.thread).toBe('dmc:666');
    expect(compositeAt(ed.pattern, 1, 1)).toBe(a);
    ed.undo();
    expect(ed.pattern.palette.find((e) => e.id === a)!.thread).toBe('dmc:310');
    expect(ed.replaceThread(a, 'dmc:321')).toBe(false); // already in palette
  });

  it('assigns distinct symbols', () => {
    const { ed } = setup();
    for (const c of ['333', '666', '700', '796']) ed.addThread(`dmc:${c}`);
    const syms = ed.pattern.palette.map((e) => e.symbol);
    expect(new Set(syms).size).toBe(syms.length);
  });
});

describe('serialise', () => {
  it('round trips a pattern, including off-canvas stitches', () => {
    const { ed, a, b } = setup(30, 25);
    paint(ed, [[0, 0], [29, 24], [5, 7]], a);
    ed.addLayer();
    paint(ed, [[5, 7]], b);
    ed.moveLayer(ed.pattern.activeLayerId, -10, 40);
    const json = JSON.parse(JSON.stringify(toFile(ed.pattern)));
    expect(fromFile(json)).toEqual(ed.pattern);
  });

  it('flattens cells to triples', () => {
    const { ed, a } = setup();
    paint(ed, [[3, 4]], a);
    expect(toFile(ed.pattern).layers[0]!.cells).toEqual([3, 4, a]);
  });

  it('rejects a newer schema with a clear error, and bad files', () => {
    const { ed } = setup();
    expect(() => fromFile({ ...toFile(ed.pattern), schema: 2 })).toThrow(UnsupportedSchemaError);
    expect(() => fromFile('x')).toThrow(InvalidFileError);
    expect(() => fromFile({ ...toFile(ed.pattern), width: 5 })).toThrow(InvalidFileError);
  });
});

describe('thread data', () => {
  it('has unique codes, valid hex and the 2017 additions', () => {
    expect(new Set(THREADS.map((t) => t.code)).size).toBe(THREADS.length);
    for (const t of THREADS) expect(t.hex).toMatch(/^#[0-9A-F]{6}$/);
    for (let i = 1; i <= 35; i++) {
      expect(THREADS.some((t) => t.code === String(i).padStart(2, '0'))).toBe(true);
    }
  });
  it('searches by code and name', () => {
    expect(searchThreads('310')[0]!.name).toBe('Black');
    expect(searchThreads('black').length).toBeGreaterThan(0);
    expect(contrastText('#000000')).toBe('#FFFFFF');
    expect(contrastText('#FFFFFF')).toBe('#000000');
  });
});

describe('colour families', () => {
  it('puts every thread in exactly one non-empty group', async () => {
    const { GROUPS, familyOf } = await import('./threads');
    expect(GROUPS.reduce((n, g) => n + g.threads.length, 0)).toBe(THREADS.length);
    for (const g of GROUPS) expect(g.threads.length).toBeGreaterThan(5);
    expect(familyOf('#000000')).toBe('Whites & greys');
    expect(familyOf('#CC0000')).toBe('Reds');
    expect(familyOf('#1E5AA8')).toBe('Blues');
    expect(familyOf('#2E8B3A')).toBe('Greens');
  });
});
