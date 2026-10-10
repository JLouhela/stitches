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

  fitScale(): number {
    const p = this.editor.pattern;
    const pad = 24;
    const s = Math.min((this.cssW - pad) / p.width, (this.cssH - pad) / p.height);
    return Math.max(0.5, Math.min(MAX_SCALE, s));
  }

  fit(): void {
    const p = this.editor.pattern;
    const s = this.fitScale();
    this.view = { scale: s, tx: (this.cssW - p.width * s) / 2, ty: (this.cssH - p.height * s) / 2 };
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

  /** Keeps at least a corner of the pattern on screen. */
  private clampView(): void {
    const p = this.editor.pattern;
    const { scale } = this.view;
    const margin = 48;
    const minTx = margin - p.width * scale;
    const maxTx = this.cssW - margin;
    const minTy = margin - p.height * scale;
    const maxTy = this.cssH - margin;
    this.view.tx = Math.min(maxTx, Math.max(minTx, this.view.tx));
    this.view.ty = Math.min(maxTy, Math.max(minTy, this.view.ty));
    this.invalidate();
    this.onViewChange?.();
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
