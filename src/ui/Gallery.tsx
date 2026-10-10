import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { clampSize } from '../model/pattern';
import { MAX_SIZE, MIN_SIZE } from '../model/types';
import { loadPattern, markExported, needsBackup, type IndexEntry } from '../storage/db';
import { parsePatternFile, patternFileName, patternToBlob, pickFile, shareOrDownload } from '../storage/files';
import { addImported, createAndOpen, duplicatePattern, gallery, openPattern, refreshGallery, removePattern, showToast, toast, updateReady } from '../state';
import { confirmDialog, Sheet } from './dialogs';
import { Plus } from './icons';

const menuFor = signal<IndexEntry | null>(null);
const creating = signal(false);

const PRESETS: [number, number][] = [[50, 50], [100, 100], [150, 150]];

function NewPatternSheet() {
  const [name, setName] = useState('');
  const [w, setW] = useState(100);
  const [h, setH] = useState(100);
  const [busy, setBusy] = useState(false);
  const close = () => { creating.value = false; };
  return (
    <Sheet title="New pattern" onClose={close}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          await createAndOpen(name || 'Untitled pattern', clampSize(w), clampSize(h));
          close();
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Could not create the pattern');
          setBusy(false);
        }
      }}>
        <label class="field">Name
          <input class="text-input" type="text" value={name} placeholder="Untitled pattern" maxLength={60} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <div class="presets" role="group" aria-label="Size presets">
          {PRESETS.map(([pw, ph]) => (
            <button type="button" key={pw} class={`btn${w === pw && h === ph ? ' active' : ''}`} onClick={() => { setW(pw); setH(ph); }}>{pw} × {ph}</button>
          ))}
        </div>
        <div class="row">
          <label class="field">Width
            <input class="text-input" type="number" inputMode="numeric" min={MIN_SIZE} max={MAX_SIZE} value={w} onInput={(e) => setW(Number((e.target as HTMLInputElement).value))} />
          </label>
          <label class="field">Height
            <input class="text-input" type="number" inputMode="numeric" min={MIN_SIZE} max={MAX_SIZE} value={h} onInput={(e) => setH(Number((e.target as HTMLInputElement).value))} />
          </label>
        </div>
        <p class="hint">{MIN_SIZE} to {MAX_SIZE} stitches each way.</p>
        <div class="row end"><button class="btn primary" type="submit" disabled={busy}>Create</button></div>
      </form>
    </Sheet>
  );
}

async function exportCard(e: IndexEntry) {
  const p = await loadPattern(e.id);
  if (!p) return;
  if (await shareOrDownload(patternToBlob(p), patternFileName(p))) {
    await markExported(e.id);
    await refreshGallery();
  }
}

async function importFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
    const p = await parsePatternFile(file);
    await addImported(p);
    showToast(`Imported "${p.name}"`);
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Import failed');
  }
}

function Card(props: { e: IndexEntry }) {
  const { e } = props;
  return (
    <li class="card">
      <button class="card-open" onClick={() => openPattern(e.id).catch((err) => showToast(err.message))} aria-label={`Open ${e.name}`}>
        <div class="card-thumb">{e.thumb ? <img src={e.thumb} alt="" /> : <span class="hint">Empty</span>}</div>
        <div class="card-name">{e.name}</div>
        <div class="card-meta">{e.width} × {e.height} · {new Date(e.updatedAt).toLocaleDateString()}</div>
      </button>
      {needsBackup(e) && <span class="badge" title="Changed since last export">Not backed up</span>}
      <button class="btn small card-menu" onClick={() => { menuFor.value = e; }} aria-label={`Menu for ${e.name}`}>Menu</button>
    </li>
  );
}

export function GalleryScreen() {
  useEffect(() => { void refreshGallery(); }, []);
  const list = gallery.value;
  const m = menuFor.value;
  return (
    <div class="gallery">
      <header class="topbar">
        <h1>Stitches</h1>
        <div class="spacer" />
        {updateReady.value && <button class="btn primary" onClick={() => updateReady.value?.()}>Update ready</button>}
        <button class="btn" onClick={() => void importFile()}>Import file</button>
        <button class="btn primary icon-label" onClick={() => { creating.value = true; }}><Plus /><span>New pattern</span></button>
      </header>
      <main class="gallery-body">
        {list === null ? <p class="hint">Loading…</p> : list.length === 0 ? (
          <div class="empty">
            <h2>No patterns yet</h2>
            <p>Start a new pattern, or import a pattern file.</p>
            <button class="btn primary" onClick={() => { creating.value = true; }}>New pattern</button>
          </div>
        ) : (
          <ul class="cards">{[...list].sort((a, b) => b.updatedAt - a.updatedAt).map((e) => <Card key={e.id} e={e} />)}</ul>
        )}
      </main>
      {toast.value && <div class="toast" role="status">{toast.value.text}</div>}
      {creating.value && <NewPatternSheet />}
      {m && (
        <Sheet title={m.name} onClose={() => { menuFor.value = null; }}>
          <div class="menu-list">
            <button class="btn wide" onClick={async () => { menuFor.value = null; await duplicatePattern(m.id); }}>Duplicate</button>
            <button class="btn wide" onClick={async () => { menuFor.value = null; await exportCard(m); }}>Export file</button>
            <button class="btn wide danger" onClick={async () => {
              menuFor.value = null;
              if (await confirmDialog('Delete pattern?', `"${m.name}" will be deleted from this device. Export it first if you want to keep it.`)) await removePattern(m.id);
            }}>Delete</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
