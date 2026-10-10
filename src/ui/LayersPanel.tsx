import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { layerHasOffCanvas } from '../model/pattern';
import { revision, session, showToast } from '../state';
import { confirmDialog, promptDialog, Sheet } from './dialogs';
import { live } from './CanvasView';
import { Eye, EyeOff, Menu, Plus } from './icons';

const menuFor = signal<string | null>(null);

function Thumb(props: { layerId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  void revision.value;
  useEffect(() => {
    const c = ref.current;
    const src = live.renderer?.layerSource(props.layerId);
    if (!c || !src) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const s = Math.min(c.width / src.width, c.height / src.height);
    ctx.drawImage(src, 0, 0, src.width * s, src.height * s);
  });
  return <canvas ref={ref} class="thumb" width={64} height={64} aria-hidden="true" />;
}

export function LayersPanel(props: { onClose?: () => void }) {
  void revision.value;
  const ed = session.value!.editor;
  const p = ed.pattern;
  const rows = [...p.layers].reverse();
  const menuLayer = p.layers.find((l) => l.id === menuFor.value);

  return (
    <aside class="layers-panel" aria-label="Layers">
      <div class="panel-head">
        <h2>Layers</h2>
        <button class="btn icon-label" onClick={() => { ed.addLayer(); }} aria-label="Add layer">
          <Plus /><span>Add</span>
        </button>
        {props.onClose && <button class="btn" onClick={props.onClose}>Close</button>}
      </div>
      <ul class="layer-list">
        {rows.map((l) => {
          const active = l.id === p.activeLayerId;
          const off = layerHasOffCanvas(p, l);
          return (
            <li key={l.id} class={`layer-row${active ? ' active' : ''}${l.visible ? '' : ' hidden'}`}>
              <button
                class="icon-btn"
                aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`}
                aria-pressed={l.visible}
                onClick={() => ed.setLayerVisible(l.id, !l.visible)}
              >
                {l.visible ? <Eye /> : <EyeOff />}
              </button>
              <button class="layer-main" onClick={() => ed.setActiveLayer(l.id)} aria-current={active}>
                <Thumb layerId={l.id} />
                <span class="layer-name">{l.name}</span>
                {off && <span class="marker" title="Has stitches past the edge" aria-label="Has stitches past the edge">⇱</span>}
              </button>
              <button class="icon-btn" aria-label={`Menu for ${l.name}`} onClick={() => { menuFor.value = l.id; }}>
                <Menu />
              </button>
            </li>
          );
        })}
      </ul>
      {menuLayer && (
        <Sheet title={menuLayer.name} onClose={() => { menuFor.value = null; }}>
          <LayerMenu layerId={menuLayer.id} />
        </Sheet>
      )}
    </aside>
  );
}

function LayerMenu(props: { layerId: string }) {
  const ed = session.value!.editor;
  const layers = ed.pattern.layers;
  const i = layers.findIndex((l) => l.id === props.layerId);
  const layer = layers[i]!;
  const close = () => { menuFor.value = null; };
  return (
    <div class="menu-list">
      <button class="btn wide" onClick={async () => {
        close();
        const name = await promptDialog('Rename layer', layer.name, 'Rename');
        if (name) ed.renameLayer(layer.id, name);
      }}>Rename</button>
      <button class="btn wide" disabled={i === layers.length - 1} onClick={() => { ed.reorderLayer(layer.id, 1); close(); }}>Move up</button>
      <button class="btn wide" disabled={i === 0} onClick={() => { ed.reorderLayer(layer.id, -1); close(); }}>Move down</button>
      <button class="btn wide" onClick={() => { ed.duplicateLayer(layer.id); close(); }}>Duplicate</button>
      <button class="btn wide" disabled={i === 0} onClick={() => { ed.mergeDown(layer.id); close(); }}>Merge down</button>
      <button class="btn wide danger" disabled={layers.length <= 1} onClick={async () => {
        close();
        if (layer.cells.size > 0 && !(await confirmDialog('Delete layer?', `"${layer.name}" and its stitches will be removed. You can undo this.`))) return;
        if (!ed.deleteLayer(layer.id)) showToast('The last layer cannot be deleted.');
      }}>Delete</button>
    </div>
  );
}
