import { useState } from 'preact/hooks';
import { countByEntry } from '../model/pattern';
import { getThread } from '../model/threads';
import { fingersOnlyPan, exportGrid, exportScale, showGrid } from '../settings';
import { markExported } from '../storage/db';
import { patternFileName, patternToBlob, shareOrDownload } from '../storage/files';
import { renderPng } from '../canvas/export';
import { session, showToast } from '../state';
import { Sheet } from './dialogs';

export function ThreadListSheet(props: { onClose: () => void }) {
  const p = session.value!.editor.pattern;
  const counts = countByEntry(p);
  const rows = p.palette
    .map((e) => ({ e, t: getThread(e.thread), n: counts.get(e.id) ?? 0 }))
    .filter((r) => r.n > 0 && r.t)
    .sort((a, b) => b.n - a.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const text = () =>
    `${p.name} (${p.width} x ${p.height})\n` +
    rows.map((r) => `DMC ${r.t!.code}\t${r.t!.name}\t${r.n}`).join('\n') +
    `\nTotal\t${total}`;
  return (
    <Sheet title="Thread list" onClose={props.onClose} wide>
      {rows.length === 0 ? <p class="hint">No stitches yet.</p> : (
        <table class="thread-table">
          <thead><tr><th>Colour</th><th>DMC</th><th>Name</th><th class="num">Stitches</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id}>
                <td><span class="chip" style={{ background: r.t!.hex }} /></td>
                <td>{r.t!.code}</td>
                <td>{r.t!.name}</td>
                <td class="num">{r.n}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td class="num">{total}</td></tr></tfoot>
        </table>
      )}
      <div class="row end">
        <button class="btn primary" disabled={rows.length === 0} onClick={async () => {
          try { await navigator.clipboard.writeText(text()); showToast('Copied'); }
          catch { showToast('Could not copy'); }
        }}>Copy as text</button>
      </div>
    </Sheet>
  );
}

export function ExportSheet(props: { onClose: () => void; onThreadList: () => void }) {
  const p = session.value!.editor.pattern;
  const [busy, setBusy] = useState(false);
  const scale = exportScale.value;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { showToast(e instanceof Error ? e.message : 'Export failed'); }
    setBusy(false);
  };
  return (
    <Sheet title="Export" onClose={props.onClose}>
      <section class="block">
        <h3>Pattern file (backup)</h3>
        <p class="hint">Keep this file in cloud storage or send it to yourself. It is the only real backup: browser storage can be cleared.</p>
        <button class="btn primary wide" disabled={busy} onClick={() => run(async () => {
          const done = await shareOrDownload(patternToBlob(p), patternFileName(p));
          if (done) { await session.value!.saver.flush(); await markExported(p.id); showToast('Pattern file exported'); }
        })}>Export pattern file</button>
      </section>
      <section class="block">
        <h3>Image (PNG)</h3>
        <label class="field">
          Size
          <select value={scale} onChange={(e) => { exportScale.value = Number((e.target as HTMLSelectElement).value); }}>
            {[4, 8, 10, 16, 20].map((s) => <option key={s} value={s}>{s} px per stitch ({p.width * s} × {p.height * s})</option>)}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" checked={exportGrid.value} onChange={(e) => { exportGrid.value = (e.target as HTMLInputElement).checked; }} />
          Include grid
        </label>
        <button class="btn primary wide" disabled={busy} onClick={() => run(async () => {
          const blob = await renderPng(p, scale, exportGrid.value);
          await shareOrDownload(blob, patternFileName(p).replace('.xstitch.json', '.png'));
        })}>Export image</button>
      </section>
      <section class="block">
        <h3>Thread list</h3>
        <button class="btn wide" onClick={props.onThreadList}>Show thread list</button>
      </section>
    </Sheet>
  );
}

/** Shows what the browser reports for a pen or finger, to tell app bugs from system ink. */
function InputTest() {
  const [info, setInfo] = useState('Touch or draw here with the pen.');
  const [log, setLog] = useState<string[]>([]);
  const show = (e: PointerEvent) => {
    const co = e.getCoalescedEvents ? e.getCoalescedEvents().length : 0;
    const line = `${e.type} ${e.pointerType} pressure ${e.pressure.toFixed(2)} buttons ${e.buttons} coalesced ${co}`;
    setInfo(line);
    if (e.type !== 'pointermove') setLog((l) => [line, ...l].slice(0, 6));
  };
  return (
    <div class="input-test" style={{ touchAction: 'none' }}
      onPointerDown={(e) => { e.preventDefault(); show(e); }}
      onPointerMove={(e) => { if (e.buttons) show(e); }}
      onPointerUp={show}
      onPointerCancel={show}
      onTouchStart={(e) => e.preventDefault()}
    >
      <strong>{info}</strong>
      <ul>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

export function SettingsSheet(props: { onClose: () => void }) {
  return (
    <Sheet title="Settings" onClose={props.onClose}>
      <label class="check">
        <input type="checkbox" checked={showGrid.value} onChange={(e) => { showGrid.value = (e.target as HTMLInputElement).checked; }} />
        Show grid
      </label>
      <label class="check">
        <input type="checkbox" checked={fingersOnlyPan.value} onChange={(e) => { fingersOnlyPan.value = (e.target as HTMLInputElement).checked; }} />
        Fingers only move the canvas (draw with a stylus)
      </label>
      <section class="block">
        <h3>Pen test</h3>
        <p class="hint">Draw in the box. It should say pointerdown pen. If you still see an ink trail, the tablet itself is drawing it.</p>
        <InputTest />
      </section>
      <section class="block">
        <h3>About</h3>
        <p class="hint">
          Patterns are stored on this device only. Export a pattern file now and then to keep a backup.
          On an iPad, open the app from its home-screen icon so Safari does not delete its data.
        </p>
        <p class="hint">
          Thread colours are community measurements of DMC thread, not values published by DMC, and screens
          differ. The colour on screen is an approximation: the DMC code is what you buy.
        </p>
        <p class="hint">Colour data: sharlagelfand/dmc (MIT) and craft-color-codes by MakeBead (CC BY 4.0).</p>
      </section>
    </Sheet>
  );
}
