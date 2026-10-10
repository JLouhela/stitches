import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { JSX } from 'preact';
import type { Tool } from '../canvas/controller';
import { layersOpen, lastTool } from '../settings';
import { loadIndex } from '../storage/db';
import { saveError, saveStatus } from '../storage/autosave';
import { closeEditor, revision, session, toast, updateReady } from '../state';
import { CanvasView, dragOffset, live } from './CanvasView';
import { promptDialog, Sheet } from './dialogs';
import { Back, Dropper, Down, Eraser, Fill, Fit, Hand, Layers, Left, Menu, Move, Pencil, Redo, Right, Undo, Up, ZoomIn, ZoomOut } from './icons';
import { LayersPanel } from './LayersPanel';
import { PaletteStrip } from './PaletteStrip';
import { ExportSheet, SettingsSheet, ThreadListSheet } from './Sheets';

const TOOLS: { id: Tool; label: string; Icon: () => JSX.Element }[] = [
  { id: 'pencil', label: 'Pencil', Icon: Pencil },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'fill', label: 'Fill', Icon: Fill },
  { id: 'eyedropper', label: 'Pick', Icon: Dropper },
  { id: 'move', label: 'Move layer', Icon: Move },
  { id: 'pan', label: 'Pan', Icon: Hand },
];

type SheetName = null | 'menu' | 'export' | 'threads' | 'settings' | 'layers';
const sheet = signal<SheetName>(null);
const nudgeBackup = signal(false);

function usePortrait(): boolean {
  const mq = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait) and (max-width: 900px)') : null;
  const [p, setP] = useState(mq?.matches ?? false);
  useEffect(() => {
    if (!mq) return;
    const f = () => setP(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return p;
}

function TopBar(props: { portrait: boolean }) {
  void revision.value;
  const s = session.value!;
  const ed = s.editor;
  const status = saveStatus.value;
  return (
    <header class="topbar">
      <button class="btn icon-label" onClick={() => void closeEditor()} aria-label="Back to gallery"><Back /><span>Gallery</span></button>
      <button class="title-btn" onClick={async () => {
        const n = await promptDialog('Rename pattern', ed.pattern.name, 'Rename');
        if (n) ed.rename(n);
      }} aria-label="Rename pattern">{ed.pattern.name}</button>
      <div class="spacer" />
      <button class="btn icon-label" disabled={!ed.canUndo} onClick={() => ed.undo()} aria-label="Undo"><Undo /><span>Undo</span></button>
      <button class="btn icon-label" disabled={!ed.canRedo} onClick={() => ed.redo()} aria-label="Redo"><Redo /><span>Redo</span></button>
      <div class={`save-status ${status}`} role="status">
        {status === 'saved' && 'Saved'}
        {status === 'saving' && 'Saving…'}
        {status === 'error' && (
          <>
            <span title={saveError.value}>⚠ Not saved</span>
            <button class="btn small" onClick={() => { sheet.value = 'export'; }}>Export</button>
          </>
        )}
      </div>
      {updateReady.value && <button class="btn primary" onClick={() => updateReady.value?.()}>Update ready</button>}
      <button
        class={`btn icon-label${(props.portrait ? sheet.value === 'layers' : layersOpen.value) ? ' active' : ''}`}
        onClick={() => { if (props.portrait) sheet.value = 'layers'; else layersOpen.value = !layersOpen.value; }}
        aria-label="Layers"
      ><Layers /><span>Layers</span></button>
      <button class="btn icon-label" onClick={() => { sheet.value = 'menu'; }} aria-label="Menu"><Menu /><span>Menu</span></button>
    </header>
  );
}

function ToolRail() {
  const tool = lastTool.value;
  const zoom = (f: number) => {
    const r = live.renderer;
    if (r) r.zoomAt(f, r.width / 2, r.height / 2);
  };
  return (
    <nav class="tool-rail" aria-label="Tools">
      {TOOLS.map(({ id, label, Icon }) => (
        <button key={id} class={`tool${tool === id ? ' active' : ''}`} aria-pressed={tool === id} onClick={() => { lastTool.value = id; }}>
          <Icon /><span>{label}</span>
        </button>
      ))}
      <div class="spacer" />
      <button class="tool" onClick={() => zoom(1.5)} aria-label="Zoom in"><ZoomIn /><span>Zoom in</span></button>
      <button class="tool" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out"><ZoomOut /><span>Zoom out</span></button>
      <button class="tool" onClick={() => live.renderer?.fit()} aria-label="Fit to screen"><Fit /><span>Fit</span></button>
    </nav>
  );
}

function Nudge() {
  const ed = session.value!.editor;
  const go = (dx: number, dy: number) => ed.moveLayer(ed.pattern.activeLayerId, dx, dy);
  const o = dragOffset.value;
  return (
    <>
      {o && <div class="offset-badge" role="status">{`(${o.dx >= 0 ? '+' : '−'}${Math.abs(o.dx)}, ${o.dy >= 0 ? '+' : '−'}${Math.abs(o.dy)})`}</div>}
      <div class="nudge" aria-label="Nudge layer">
        <button class="nudge-btn up" onClick={() => go(0, -1)} aria-label="Nudge up"><Up /></button>
        <button class="nudge-btn left" onClick={() => go(-1, 0)} aria-label="Nudge left"><Left /></button>
        <button class="nudge-btn right" onClick={() => go(1, 0)} aria-label="Nudge right"><Right /></button>
        <button class="nudge-btn down" onClick={() => go(0, 1)} aria-label="Nudge down"><Down /></button>
      </div>
    </>
  );
}

export function EditorScreen() {
  const s = session.value!;
  const portrait = usePortrait();
  const tool = lastTool.value;
  void revision.value;

  // Backup nudge: many edits since the last export.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const row = (await loadIndex()).find((e) => e.id === s.editor.pattern.id);
      if (!cancelled && row) nudgeBackup.value = row.editsSinceExport >= 50 && (!row.exportedAt || row.updatedAt > row.exportedAt);
    };
    void check();
    const unsub = saveStatus.subscribe((v) => { if (v === 'saved') void check(); });
    return () => { cancelled = true; unsub(); };
  }, [s]);

  const showPanel = portrait ? sheet.value === 'layers' : layersOpen.value;
  const showMsg = toast.value;
  return (
    <div class={`editor${portrait ? ' portrait' : ''}${showPanel && !portrait ? ' with-layers' : ''}`}>
      <TopBar portrait={portrait} />
      {nudgeBackup.value && (
        <div class="banner">
          This pattern has changed a lot since it was last backed up.
          <button class="btn small" onClick={() => { sheet.value = 'export'; }}>Export a backup</button>
          <button class="btn small" onClick={() => { nudgeBackup.value = false; }}>Later</button>
        </div>
      )}
      <ToolRail />
      <main class="canvas-wrap">
        <CanvasView />
        {tool === 'move' && <Nudge />}
        {showMsg && <div class="toast" role="status">{showMsg.text}</div>}
      </main>
      {showPanel && !portrait && <LayersPanel />}
      {portrait && sheet.value === 'layers' && (
        <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) sheet.value = null; }}>
          <div class="sheet side"><LayersPanel onClose={() => { sheet.value = null; }} /></div>
        </div>
      )}
      <PaletteStrip />
      {sheet.value === 'menu' && (
        <Sheet title="Menu" onClose={() => { sheet.value = null; }}>
          <div class="menu-list">
            <button class="btn wide" onClick={() => { sheet.value = 'export'; }}>Export…</button>
            <button class="btn wide" onClick={() => { sheet.value = 'threads'; }}>Thread list</button>
            <button class="btn wide" onClick={() => { sheet.value = 'settings'; }}>Settings</button>
            <button class="btn wide" onClick={() => { live.renderer?.fit(); sheet.value = null; }}>Fit pattern to screen</button>
          </div>
        </Sheet>
      )}
      {sheet.value === 'export' && <ExportSheet onClose={() => { sheet.value = null; }} onThreadList={() => { sheet.value = 'threads'; }} />}
      {sheet.value === 'threads' && <ThreadListSheet onClose={() => { sheet.value = null; }} />}
      {sheet.value === 'settings' && <SettingsSheet onClose={() => { sheet.value = null; }} />}
    </div>
  );
}
