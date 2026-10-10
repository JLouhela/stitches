import { useMemo, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { getThread, contrastText, GROUPS, searchThreads, threadHex, threadId, type Thread } from '../model/threads';
import { revision, selectedEntry, session, showToast } from '../state';
import { Sheet } from './dialogs';
import { Edit, Plus } from './icons';

const picker = signal<null | { mode: 'add' } | { mode: 'replace'; entryId: number }>(null);
const editMode = signal(false);

function Swatch(props: { thread: Thread; size?: 'lg'; onClick: () => void; selected?: boolean; label?: string }) {
  const { thread } = props;
  return (
    <button
      class={`swatch${props.selected ? ' selected' : ''}${props.size === 'lg' ? ' lg' : ''}`}
      style={{ background: thread.hex, color: contrastText(thread.hex) }}
      onClick={props.onClick}
      aria-label={`${props.label ?? 'DMC'} ${thread.code} ${thread.name}`}
      aria-pressed={props.selected}
    >
      <span>{thread.code}</span>
    </button>
  );
}

export function PaletteStrip() {
  void revision.value;
  const ed = session.value!.editor;
  const palette = ed.pattern.palette;
  const sel = palette.find((e) => e.id === selectedEntry.value);
  const selThread = sel && getThread(sel.thread);
  const editing = editMode.value;

  return (
    <div class="palette-strip">
      <div class="current" aria-live="polite">
        {selThread ? (
          <>
            <span class="chip" style={{ background: selThread.hex }} />
            <div class="current-text">
              <strong>DMC {selThread.code}</strong>
              <span>{selThread.name}</span>
            </div>
          </>
        ) : (
          <div class="current-text"><strong>No thread</strong><span>Tap + to pick one</span></div>
        )}
      </div>
      <div class="swatches">
        {palette.map((e) => {
          const t = getThread(e.thread);
          if (!t) return null;
          return (
            <Swatch
              key={e.id}
              thread={t}
              selected={e.id === selectedEntry.value}
              onClick={() => {
                if (editing) { picker.value = { mode: 'replace', entryId: e.id }; return; }
                selectedEntry.value = e.id;
              }}
            />
          );
        })}
      </div>
      <button class="btn icon-label" onClick={() => { picker.value = { mode: 'add' }; }} aria-label="Add thread">
        <Plus /><span>Add</span>
      </button>
      <button class={`btn icon-label${editing ? ' active' : ''}`} onClick={() => { editMode.value = !editing; }} aria-pressed={editing}>
        <Edit /><span>{editing ? 'Done' : 'Edit'}</span>
      </button>
      {editing && sel && (
        <button
          class="btn danger"
          onClick={() => {
            if (!ed.removeEntry(sel.id)) showToast('That thread is used by stitches. Replace it with another thread instead.');
            else selectedEntry.value = ed.pattern.palette[0]?.id;
          }}
        >
          Remove {selThread?.code}
        </button>
      )}
      {picker.value && <ThreadPicker />}
    </div>
  );
}

function ThreadPicker() {
  const mode = picker.value!;
  const ed = session.value!.editor;
  const [q, setQ] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => searchThreads(q), [q]);
  const inPalette = new Set(ed.pattern.palette.map((e) => e.thread));
  const title = mode.mode === 'add' ? 'Choose a thread' : 'Replace thread';
  const close = () => { picker.value = null; };
  const choose = (t: Thread) => {
    if (mode.mode === 'add') {
      selectedEntry.value = ed.addThread(threadId(t.code)).id;
    } else if (!ed.replaceThread(mode.entryId, threadId(t.code))) {
      showToast(`DMC ${t.code} is already in this pattern.`);
      return;
    }
    close();
  };
const card = (t: Thread) => (
    <button
      key={t.code}
      class={`thread-card${inPalette.has(threadId(t.code)) ? ' used' : ''}`}
      onClick={() => choose(t)}
      aria-label={`DMC ${t.code} ${t.name}`}
    >
      <span class="thread-swatch" style={{ background: threadHex(threadId(t.code)), color: contrastText(t.hex) }}>{t.code}</span>
      <span class="thread-name">{t.name}</span>
    </button>
  );
  const current = mode.mode === 'replace' ? ed.pattern.palette.find((e) => e.id === mode.entryId) : undefined;
  return (
    <Sheet title={title} onClose={close} full>
      {current && (
        <p class="hint">Every stitch of DMC {getThread(current.thread)?.code} changes to the thread you choose.</p>
      )}
      <input
        class="text-input"
        type="search"
        inputMode="search"
        placeholder="Search by code or name, e.g. 310 or blue"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        aria-label="Search threads"
      />
      {q.trim() === '' && (
        <div class="row">
          <button class={`btn${grouped ? ' active' : ''}`} aria-pressed={grouped} onClick={() => setGrouped(true)}>By colour</button>
          <button class={`btn${!grouped ? ' active' : ''}`} aria-pressed={!grouped} onClick={() => setGrouped(false)}>All threads</button>
        </div>
      )}
      {q.trim() === '' && grouped ? (
        <div class="families">
          {GROUPS.map((g) => (
            <section key={g.family} class="family">
              <button class="family-head" aria-expanded={open === g.family} onClick={() => setOpen(open === g.family ? null : g.family)}>
                <span class="family-name">{g.family}</span>
                <span class="family-samples" aria-hidden="true">
                  {g.threads.filter((_, i) => i % Math.max(1, Math.floor(g.threads.length / 8)) === 0).slice(0, 8).map((t) => (
                    <i key={t.code} style={{ background: t.hex }} />
                  ))}
                </span>
                <span class="family-count">{g.threads.length}</span>
                <span class="family-chev">{open === g.family ? '−' : '+'}</span>
              </button>
              {open === g.family && <div class="thread-grid">{g.threads.map(card)}</div>}
            </section>
          ))}
        </div>
      ) : (
        <div class="thread-grid">
          {list.map(card)}
          {list.length === 0 && <p class="hint">No thread matches "{q}".</p>}
        </div>
      )}
    </Sheet>
  );
}
