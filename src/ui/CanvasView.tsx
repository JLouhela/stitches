import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { Controller } from '../canvas/controller';
import { Renderer } from '../canvas/renderer';
import { fingersOnlyPan, lastTool, showGrid } from '../settings';
import { selectedEntry, session, showToast } from '../state';

/** Live offset shown while the Move tool drags. */
export const dragOffset = signal<{ dx: number; dy: number } | null>(null);

/** The mounted renderer, for the zoom buttons and layer thumbnails. */
export const live: { renderer: Renderer | null; controller: Controller | null } = { renderer: null, controller: null };

export function CanvasView() {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = session.value!;
  const editor = s.editor;

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new Renderer(canvas, editor);
    const controller = new Controller(canvas, editor, renderer, {
      tool: () => lastTool.peek(),
      selectedEntry: () => selectedEntry.peek(),
      fingersOnlyPan: () => fingersOnlyPan.peek(),
      message: showToast,
      picked: (id) => { selectedEntry.value = id; lastTool.value = 'pencil'; },
      offset: (o) => { dragOffset.value = o; },
    });
    live.renderer = renderer;
    live.controller = controller;
    let first = true;
    const ro = new ResizeObserver(() => {
      renderer.resize();
      if (first) { renderer.fit(); first = false; } else renderer.setView(renderer.view);
    });
    ro.observe(canvas);
    const stopGrid = showGrid.subscribe((v) => { renderer.showGrid = v; renderer.invalidate(); });
    const stopTool = lastTool.subscribe(() => controller.abort());
    return () => {
      ro.disconnect();
      stopGrid();
      stopTool();
      controller.dispose();
      renderer.dispose();
      live.renderer = null;
      live.controller = null;
    };
  }, [editor]);

  return <canvas ref={ref} class="pattern-canvas" aria-label="Pattern canvas" />;
}
