import type { Editor, ChangeEvent } from '../model/editor';
import type { Layer } from '../model/types';
import { keyX, keyY } from '../model/key';
import { threadHex } from '../model/threads';

export interface View {
  scale: number; // CSS px per stitch
  tx: number; // CSS px position of the pattern origin
  ty: number;
}

export const MAX_SCALE = 48;
/** Space reserved for row and column numbers, and for scrollbars. */
export const GUTTER_L = 34;
export const GUTTER_T = 24;
export const BAR = 16;

export interface Bar {
  horizontal: boolean;
  start: number;
  trackLen: number;
  thumbLen: number;
  thumbPos: number;
  travel: number;
  span: number;
}

interface LayerCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/**
 * Imperative canvas renderer. Preact never touches the canvas; the renderer listens to
 * model changes and redraws on requestAnimationFrame.
 */
export class Renderer {
  view: View = { scale: 10, tx: 0, ty: 0 };
  showGrid = true;
  /** While a layer is dragged it is drawn at this offset; the model changes on release. */
  drag: { layerId: string; dx: number; dy: number } | null = null;

  private ctx: CanvasRenderingContext2D;
  private layers = new Map<string, LayerCanvas>();
  private colours = new Map<number, string>();
  private raf = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private unsub: () => void;
  onViewChange?: () => void;

  constructor(private canvas: HTMLCanvasElement, private editor: Editor) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.rebuildAll();
    this.unsub = editor.subscribe((e) => this.onChange(e));
  }

  dispose(): void {
    this.unsub();
    cancelAnimationFrame(this.raf);
  }

  // ---- sizing and view -----------------------------------------------------

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.invalidate();
  }

  get width(): number { return this.cssW; }
  get height(): number { return this.cssH; }

  /** Screen rectangle the pattern lives in: inside the number gutters and scrollbars. */
  private area(): { l: number; t: number; r: number; b: number } {
    return { l: GUTTER_L, t: GUTTER_T, r: this.cssW - BAR, b: this.cssH - BAR };
  }

  fitScale(): number {
    const p = this.editor.pattern;
    const a = this.area();
    const pad = 16;
    const s = Math.min((a.r - a.l - pad) / p.width, (a.b - a.t - pad) / p.height);
    return Math.max(0.5, Math.min(MAX_SCALE, s));
  }

  fit(): void {
    const p = this.editor.pattern;
    const a = this.area();
    const s = this.fitScale();
    this.view = {
      scale: s,
      tx: a.l + (a.r - a.l - p.width * s) / 2,
      ty: a.t + (a.b - a.t - p.height * s) / 2,
    };
    this.invalidate();
    this.onViewChange?.();
  }

  /** Zoom keeping the screen point (cx, cy) fixed. */
  zoomAt(factor: number, cx: number, cy: number): void {
    const min = this.fitScale();
    const next = Math.min(MAX_SCALE, Math.max(min, this.view.scale * factor));
    const k = next / this.view.scale;
    this.view = { scale: next, tx: cx - (cx - this.view.tx) * k, ty: cy - (cy - this.view.ty) * k };
    this.clampView();
  }

  panBy(dx: number, dy: number): void {
    this.view = { ...this.view, tx: this.view.tx + dx, ty: this.view.ty + dy };
    this.clampView();
  }

  setView(v: View): void {
    this.view = v;
    this.clampView();
  }

  private range(): { minTx: number; maxTx: number; minTy: number; maxTy: number } {
    const p = this.editor.pattern;
    const a = this.area();
    const { scale } = this.view;
    const margin = 48;
    return {
      minTx: a.l + margin - p.width * scale,
      maxTx: a.r - margin,
      minTy: a.t + margin - p.height * scale,
      maxTy: a.b - margin,
    };
  }

  /** Keeps at least a corner of the pattern on screen. */
  private clampView(): void {
    const r = this.range();
    this.view.tx = Math.min(r.maxTx, Math.max(r.minTx, this.view.tx));
    this.view.ty = Math.min(r.maxTy, Math.max(r.minTy, this.view.ty));
    this.invalidate();
    this.onViewChange?.();
  }

  // ---- scrollbars -----------------------------------------------------------------

  /** Scrollbar geometry, or null for an axis where the whole pattern is already visible. */
  scrollbar(axis: 'x' | 'y'): Bar | null {
    const p = this.editor.pattern;
    const a = this.area();
    const r = this.range();
    const horizontal = axis === 'x';
    const size = (horizontal ? p.width : p.height) * this.view.scale;
    const avail = horizontal ? a.r - a.l : a.b - a.t;
    if (size <= avail + 1) return null;
    const trackLen = avail;
    const span = horizontal ? r.maxTx - r.minTx : r.maxTy - r.minTy;
    const thumbLen = Math.min(trackLen, Math.max(56, (trackLen * avail) / (avail + span)));
    const pos = horizontal ? this.view.tx : this.view.ty;
    const max = horizontal ? r.maxTx : r.maxTy;
    const frac = span > 0 ? (max - pos) / span : 0;
    const travel = trackLen - thumbLen;
    return { horizontal, start: horizontal ? a.l : a.t, trackLen, thumbLen, thumbPos: frac * travel, travel, span };
  }

  /** Which scrollbar (and whether its thumb) is under a screen point; hit zones are generous. */
  hitScrollbar(x: number, y: number): { axis: 'x' | 'y'; onThumb: boolean } | null {
    const zone = 30;
    const h = this.scrollbar('x');
    if (h && y >= this.cssH - zone && x >= h.start) {
      const along = x - h.start;
      return { axis: 'x', onThumb: along >= h.thumbPos - 8 && along <= h.thumbPos + h.thumbLen + 8 };
    }
    const v = this.scrollbar('y');
    if (v && x >= this.cssW - zone && y >= v.start) {
      const along = y - v.start;
      return { axis: 'y', onThumb: along >= v.thumbPos - 8 && along <= v.thumbPos + v.thumbLen + 8 };
    }
    return null;
  }

  /** Drags a thumb by a number of screen pixels along its track. */
  scrollThumbBy(axis: 'x' | 'y', px: number): void {
    const bar = this.scrollbar(axis);
    if (!bar || bar.travel <= 0) return;
    const d = (px * bar.span) / bar.travel;
    if (axis === 'x') this.view = { ...this.view, tx: this.view.tx - d };
    else this.view = { ...this.view, ty: this.view.ty - d };
    this.clampView();
  }

  /** Centres a thumb on a screen position along its track (track taps). */
  scrollThumbTo(axis: 'x' | 'y', pos: number): void {
    const bar = this.scrollbar(axis);
    if (!bar) return;
    this.scrollThumbBy(axis, pos - bar.start - bar.thumbLen / 2 - bar.thumbPos);
  }

  /** True when a screen point is over the number gutters. */
  inGutter(x: number, y: number): boolean {
    return x < GUTTER_L || y < GUTTER_T;
  }

  screenToCell(sx: number, sy: number): [number, number] {
    const { scale, tx, ty } = this.view;
    return [Math.floor((sx - tx) / scale), Math.floor((sy - ty) / scale)];
  }

  // ---- offscreen layer canvases -----------------------------------------------

  private rebuildAll(): void {
    const p = this.editor.pattern;
    this.colours = new Map(p.palette.map((e) => [e.id, threadHex(e.thread)]));
    const live = new Set<string>();
    for (const l of p.layers) {
      live.add(l.id);
      this.rebuildLayer(l);
    }
    for (const id of [...this.layers.keys()]) if (!live.has(id)) this.layers.delete(id);
  }

  private layerCanvas(l: Layer): LayerCanvas {
    const p = this.editor.pattern;
    let lc = this.layers.get(l.id);
    if (!lc || lc.w !== p.width || lc.h !== p.height) {
      const canvas = document.createElement('canvas');
      canvas.width = p.width;
      canvas.height = p.height;
      lc = { canvas, ctx: canvas.getContext('2d')!, w: p.width, h: p.height };
      this.layers.set(l.id, lc);
    }
    return lc;
  }

  private rebuildLayer(l: Layer): void {
    const lc = this.layerCanvas(l);
    lc.ctx.clearRect(0, 0, lc.w, lc.h);
    for (const [k, v] of l.cells) this.paintCell(lc, keyX(k), keyY(k), v);
  }

  private paintCell(lc: LayerCanvas, x: number, y: number, v: number | undefined): void {
    if (x < 0 || y < 0 || x >= lc.w || y >= lc.h) return;
    if (v === undefined) {
      lc.ctx.clearRect(x, y, 1, 1);
    } else {
      lc.ctx.fillStyle = this.colours.get(v) ?? '#FF00FF';
      lc.ctx.fillRect(x, y, 1, 1);
    }
  }

  /** The offscreen canvas of a layer, for thumbnails. */
  layerSource(id: string): HTMLCanvasElement | undefined {
    return this.layers.get(id)?.canvas;
  }

  private onChange(e: ChangeEvent): void {
    if (e.kind === 'cells') {
      const layer = this.editor.pattern.layers.find((l) => l.id === e.layerId);
      if (layer) {
        const lc = this.layerCanvas(layer);
        for (const k of e.keys) this.paintCell(lc, keyX(k), keyY(k), layer.cells.get(k));
      }
    } else if (e.kind === 'all') {
      this.rebuildAll();
    }
    this.invalidate();
  }

  // ---- drawing -------------------------------------------------------------------

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const { ctx, dpr } = this;
    const p = this.editor.pattern;
    const { scale, tx, ty } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3b3633';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const pw = p.width * scale, ph = p.height * scale;
    ctx.fillStyle = p.fabric;
    ctx.fillRect(tx, ty, pw, ph);

    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, pw, ph);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    for (const l of p.layers) {
      if (!l.visible) continue;
      const lc = this.layers.get(l.id);
      if (!lc) continue;
      const off = this.drag && this.drag.layerId === l.id ? this.drag : null;
      const dx = off ? off.dx : 0, dy = off ? off.dy : 0;
      ctx.drawImage(lc.canvas, tx + dx * scale, ty + dy * scale, pw, ph);
    }
    ctx.restore();

    if (this.showGrid) this.drawGrid(pw, ph);
    this.drawNumbers();
    this.drawScrollbars();
  }

  /** Column numbers along the top and row numbers down the left, 1-based. */
  private drawNumbers(): void {
    const { ctx } = this;
    const p = this.editor.pattern;
    const { scale, tx, ty } = this.view;
    const step = [1, 5, 10, 20, 50].find((n) => n * scale >= 26) ?? 100;
    ctx.fillStyle = 'rgba(255, 253, 247, 0.96)';
    ctx.fillRect(0, 0, this.cssW, GUTTER_T);
    ctx.fillRect(0, 0, GUTTER_L, this.cssH);
    ctx.strokeStyle = '#d9cfbf';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GUTTER_T + 0.5); ctx.lineTo(this.cssW, GUTTER_T + 0.5);
    ctx.moveTo(GUTTER_L + 0.5, 0); ctx.lineTo(GUTTER_L + 0.5, this.cssH);
    ctx.stroke();
    ctx.fillStyle = '#2b2522';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER_L + 1, 0, this.cssW, GUTTER_T);
    ctx.clip();
    for (let i = 0; i < p.width; i++) {
      const n = i + 1;
      if (n % step !== 0 && step !== 1) continue;
      const x = tx + (i + 0.5) * scale;
      if (x < GUTTER_L - 10 || x > this.cssW + 10) continue;
      ctx.fillText(String(n), x, GUTTER_T / 2 + 1);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GUTTER_T + 1, GUTTER_L, this.cssH);
    ctx.clip();
    for (let j = 0; j < p.height; j++) {
      const n = j + 1;
      if (n % step !== 0 && step !== 1) continue;
      const y = ty + (j + 0.5) * scale;
      if (y < GUTTER_T - 10 || y > this.cssH + 10) continue;
      ctx.fillText(String(n), GUTTER_L / 2, y);
    }
    ctx.restore();
  }

  private drawScrollbars(): void {
    const { ctx } = this;
    for (const axis of ['x', 'y'] as const) {
      const bar = this.scrollbar(axis);
      if (!bar) continue;
      const thick = 10;
      const off = axis === 'x' ? this.cssH - thick - 3 : this.cssW - thick - 3;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      if (axis === 'x') ctx.roundRect(bar.start, off, bar.trackLen, thick, 5);
      else ctx.roundRect(off, bar.start, thick, bar.trackLen, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,45,40,0.6)';
      ctx.beginPath();
      if (axis === 'x') ctx.roundRect(bar.start + bar.thumbPos, off, bar.thumbLen, thick, 5);
      else ctx.roundRect(off, bar.start + bar.thumbPos, thick, bar.thumbLen, 5);
      ctx.fill();
    }
  }

  private drawGrid(pw: number, ph: number): void {
    const { ctx } = this;
    const p = this.editor.pattern;
    const { scale, tx, ty } = this.view;
    // Only visible range
    const x0 = Math.max(0, Math.floor(-tx / scale)), x1 = Math.min(p.width, Math.ceil((this.cssW - tx) / scale));
    const y0 = Math.max(0, Math.floor(-ty / scale)), y1 = Math.min(p.height, Math.ceil((this.cssH - ty) / scale));
    const fine = scale >= 6;
    const line = (vertical: boolean, i: number) => {
      const pos = Math.round((vertical ? tx : ty) + i * scale) + 0.5;
      if (vertical) { ctx.moveTo(pos, Math.max(0, ty)); ctx.lineTo(pos, Math.min(this.cssH, ty + ph)); }
      else { ctx.moveTo(Math.max(0, tx), pos); ctx.lineTo(Math.min(this.cssW, tx + pw), pos); }
    };
    ctx.lineWidth = 1;
    if (fine) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      for (let i = x0; i <= x1; i++) if (i % 10 !== 0) line(true, i);
      for (let j = y0; j <= y1; j++) if (j % 10 !== 0) line(false, j);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = scale >= 6 ? 1.5 : 1;
    ctx.beginPath();
    for (let i = Math.ceil(x0 / 10) * 10; i <= x1; i += 10) line(true, i);
    for (let j = Math.ceil(y0 / 10) * 10; j <= y1; j += 10) line(false, j);
    ctx.stroke();
    // Pattern border
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx, ty, pw, ph);
  }
}
