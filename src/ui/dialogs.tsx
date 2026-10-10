import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** A full-height or centred sheet with a visible Close button. */
export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean; full?: boolean }) {
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget && !props.full) props.onClose(); }}>
      <div class={`sheet${props.wide ? ' wide' : ''}${props.full ? ' full' : ''}`} role="dialog" aria-label={props.title}>
        <header class="sheet-head">
          <h2>{props.title}</h2>
          <button class="btn" onClick={props.onClose}>Close</button>
        </header>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

interface ConfirmReq { kind: 'confirm'; title: string; text: string; ok: string; resolve: (v: boolean) => void }
interface PromptReq { kind: 'prompt'; title: string; value: string; ok: string; resolve: (v: string | null) => void }
const request = signal<ConfirmReq | PromptReq | null>(null);

export function confirmDialog(title: string, text: string, ok = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => { request.value = { kind: 'confirm', title, text, ok, resolve }; });
}

export function promptDialog(title: string, value = '', ok = 'OK'): Promise<string | null> {
  return new Promise((resolve) => { request.value = { kind: 'prompt', title, value, ok, resolve }; });
}

export function DialogHost() {
  const req = request.value;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (req?.kind === 'prompt') input.current?.select(); }, [req]);
  if (!req) return null;
  const close = (v: boolean | string | null) => {
    request.value = null;
    (req.resolve as (x: boolean | string | null) => void)(req.kind === 'confirm' ? v === true : (v as string | null));
  };
  return (
    <div class="scrim dialog-scrim">
      <form
        class="sheet small"
       
        aria-label={req.title}
        onSubmit={(e) => { e.preventDefault(); close(req.kind === 'confirm' ? true : input.current?.value ?? ''); }}
      >
        <h2>{req.title}</h2>
        {req.kind === 'confirm' ? <p>{req.text}</p> : (
          <input ref={input} class="text-input" type="text" defaultValue={req.value} maxLength={60} autofocus />
        )}
        <div class="row end">
          <button type="button" class="btn" onClick={() => close(req.kind === 'confirm' ? false : null)}>Cancel</button>
          <button type="submit" class={`btn ${req.kind === 'confirm' ? 'danger' : 'primary'}`}>{req.ok}</button>
        </div>
      </form>
    </div>
  );
}
