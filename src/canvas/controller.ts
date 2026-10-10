import type { Editor, Stroke } from '../model/editor';
import { key } from '../model/key';
import { activeLayer, compositeAt, inBounds } from '../model/pattern';
import { fillRegion, lineCells } from '../model/tools';
import type { Renderer } from './renderer';

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'move' | 'pan';

export interface ControllerHooks {
  tool(): Tool;
  selectedEntry(): number | undefined;
  fingersOnlyPan(): boolean;
  message(text: string): void;
  /** Eyedropper result; the UI selects the entry and returns to the pencil. */
  picked(entryId: number): void;
  /** Live layer offset while the Move tool drags, or null. */
  offset(o: { dx: number; dy: number } | null): void;
}

type Mode = 'idle' | 'stroke' | 'tap' | 'move' | 'pan' | 'gesture';

interface Pt { x: number; y: number }

/**
 * Pointer Events only. One pointer uses the active tool (or pans); a second pointer
 * landing reverts any stroke in progress and turns the pair into pan and pinch-zoom
 * until every finger lifts.
 */
export class Controller {
  private pointers = new Map<number, Pt>();
  private mode: Mode = 'idle';
  private stroke: Stroke | null = null;
  private last: [number, number] | null = null;
  private tapStart: Pt | null = null;
  private tapMoved = false;
  private pendingOffset: { dx: number; dy: number } | null = null;
  private gesture: { dist: number; mid: Pt } | null = null;
  private activeTool: Tool = 'pencil';
  private lastPan: Pt | null = null;

  constructor(
    private el: HTMLCanvasElement,
    private editor: Editor,
    private renderer: Renderer,
    private hooks: ControllerHooks,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('lostpointercapture', this.lost);
    el.addEventListener('contextmenu', this.noMenu);
    el.addEventListener('wheel', this.wheel, { passive: false });
  }

  dispose(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.down);
    el.removeEventListener('pointermove', this.move);
    el.removeEventListener('pointerup', this.up);
    el.removeEventListener('pointercancel', this.cancel);
    el.removeEventListener('lostpointercapture', this.lost);
    el.removeEventListener('contextmenu', this.noMenu);
    el.removeEventListener('wheel', this.wheel);
  }

  /** Abandons whatever is in progress (used when the tool or layer is changed from the UI). */
  abort(): void {
    this.revertWork();
    this.pointers.clear();
    this.mode = 'idle';
  }

  private noMenu = (e: Event) => e.preventDefault();

  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---- pointer lifecycle --------------------------------------------------------

  private down = (e: PointerEvent) => {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const pt = this.local(e);
    this.pointers.set(e.pointerId, pt);

    if (this.pointers.size >= 2) {
      this.revertWork();
      this.startGesture();
      return;
    }
    if (this.mode === 'gesture') return; // wait for all fingers to lift

    const tool = this.hooks.tool();
    this.activeTool = tool;
    const fingerPan = e.pointerType === 'touch' && this.hooks.fingersOnlyPan();
    if (tool === 'pan' || fingerPan) {
      this.mode = 'pan';
      this.lastPan = pt;
      return;
    }
    this.beginTool(tool, pt);
  };

  private beginTool(tool: Tool, pt: Pt): void {
    const layer = activeLayer(this.editor.pattern);
    const drawing = tool === 'pencil' || tool === 'eraser' || tool === 'fill' || tool === 'move';
    if (drawing && !layer.visible) {
      this.hooks.message(`"${layer.name}" is hidden. Show it to draw on it.`);
      this.mode = 'gesture'; // swallow the rest of this touch
      return;
    }
    const cell = this.renderer.screenToCell(pt.x, pt.y);
    switch (tool) {
      case 'pencil':
      case 'eraser': {
        if (tool === 'pencil' && this.hooks.selectedEntry() === undefined) {
          this.hooks.message('Pick a thread first.');
          this.mode = 'gesture';
          return;
        }
        this.mode = 'stroke';
        this.stroke = this.editor.beginStroke();
        this.last = null;
        this.applyStroke(cell);
        return;
      }
      case 'fill':
      case 'eyedropper':
        this.mode = 'tap';
        this.tapStart = pt;
        this.tapMoved = false;
        return;
      case 'move':
        this.mode = 'move';
        this.tapStart = pt;
        this.pendingOffset = { dx: 0, dy: 0 };
        return;
    }
  }

  private move = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const events = this.mode === 'stroke' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const samples = events.length ? events : [e];
    for (const s of samples) this.sample(e.pointerId, this.local(s));
  };

  private sample(id: number, pt: Pt): void {
    this.pointers.set(id, pt);
    switch (this.mode) {
      case 'stroke':
        this.applyStroke(this.renderer.screenToCell(pt.x, pt.y));
        break;
      case 'pan':
        if (this.lastPan) this.renderer.panBy(pt.x - this.lastPan.x, pt.y - this.lastPan.y);
        this.lastPan = pt;
        break;
      case 'tap':
        if (this.tapStart && Math.hypot(pt.x - this.tapStart.x, pt.y - this.tapStart.y) > 10) this.tapMoved = true;
        break;
      case 'move': {
        if (!this.tapStart) break;
        const s = this.renderer.view.scale;
        const dx = Math.round((pt.x - this.tapStart.x) / s);
        const dy = Math.round((pt.y - this.tapStart.y) / s);
        this.pendingOffset = { dx, dy };
        this.renderer.drag = { layerId: this.editor.pattern.activeLayerId, dx, dy };
        this.renderer.invalidate();
        this.hooks.offset(this.pendingOffset);
        break;
      }
      case 'gesture':
        if (this.pointers.size >= 2) this.updateGesture();
        break;
    }
  }

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const pt = this.local(e);
    const wasMode = this.mode;
    if (wasMode === 'gesture') {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 1) this.startGesture(); // keep a stable state until all lift
      if (this.pointers.size === 0) this.mode = 'idle';
      return;
    }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0) return;

    switch (wasMode) {
      case 'stroke':
        this.stroke?.commit();
        break;
      case 'tap':
        if (!this.tapMoved) this.finishTap(pt);
        break;
      case 'move':
        this.finishMove();
        break;
    }
    this.cleanup();
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.revertWork();
    if (this.pointers.size === 0) this.mode = 'idle';
    else { this.mode = 'gesture'; this.startGesture(); }
  };

  private lost = (e: PointerEvent) => {
    // A lost capture without pointerup/cancel (rare) must not leave a stroke dangling.
    if (this.pointers.has(e.pointerId) && this.mode === 'stroke') {
      this.pointers.delete(e.pointerId);
      this.stroke?.commit();
      this.cleanup();
    }
  };

  private cleanup(): void {
    this.mode = 'idle';
    this.stroke = null;
    this.last = null;
    this.tapStart = null;
    this.lastPan = null;
    this.pendingOffset = null;
    this.renderer.drag = null;
    this.hooks.offset(null);
    this.renderer.invalidate();
  }

  /** Undo whatever the single-pointer tool had applied so far. */
  private revertWork(): void {
    this.stroke?.revert();
    this.stroke = null;
    this.last = null;
    this.tapStart = null;
    this.renderer.drag = null;
    this.pendingOffset = null;
    this.hooks.offset(null);
    this.renderer.invalidate();
  }

  // ---- tools ---------------------------------------------------------------------

  private applyStroke(cell: [number, number]): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const value = this.activeTool === 'eraser' ? undefined : this.hooks.selectedEntry();
    const p = this.editor.pattern;
    const from = this.last ?? cell;
    const keys: number[] = [];
    for (const [x, y] of lineCells(from[0], from[1], cell[0], cell[1])) {
      if (!inBounds(p, x, y)) continue;
      const k = key(x, y);
      if (stroke.set(k, value)) keys.push(k);
    }
    this.last = cell;
    stroke.flush(keys);
  }

  private finishTap(pt: Pt): void {
    const [x, y] = this.renderer.screenToCell(pt.x, pt.y);
    const p = this.editor.pattern;
    if (!inBounds(p, x, y)) return;
    if (this.activeTool === 'eyedropper') {
      const v = compositeAt(p, x, y);
      if (v === undefined) this.hooks.message('No stitch there.');
      else this.hooks.picked(v);
      return;
    }
    const entry = this.hooks.selectedEntry();
    if (entry === undefined) {
      this.hooks.message('Pick a thread first.');
      return;
    }
    const region = fillRegion(p, x, y);
    const stroke = this.editor.beginStroke();
    const keys: number[] = [];
    for (const k of region) if (stroke.set(k, entry)) keys.push(k);
    stroke.flush(keys);
    stroke.commit();
  }

  private finishMove(): void {
    const o = this.pendingOffset;
    this.renderer.drag = null;
    if (o && (o.dx !== 0 || o.dy !== 0)) this.editor.moveLayer(this.editor.pattern.activeLayerId, o.dx, o.dy);
  }

  // ---- pan and pinch -------------------------------------------------------------------

  private startGesture(): void {
    this.mode = 'gesture';
    this.renderer.drag = null;
    this.hooks.offset(null);
    const pts = [...this.pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = [pts[0]!, pts[1]!];
      this.gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else {
      this.gesture = null;
    }
  }

  private updateGesture(): void {
    const pts = [...this.pointers.values()];
    const g = this.gesture;
    if (pts.length < 2 || !g) return;
    const [a, b] = [pts[0]!, pts[1]!];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.renderer.panBy(mid.x - g.mid.x, mid.y - g.mid.y);
    this.renderer.zoomAt(dist / g.dist, mid.x, mid.y);
    this.gesture = { dist, mid };
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const pt = this.local(e);
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      this.renderer.zoomAt(Math.exp(-e.deltaY * 0.002), pt.x, pt.y);
    } else {
      this.renderer.panBy(-e.deltaX, 0);
    }
  };
}
