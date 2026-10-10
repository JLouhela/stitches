import { signal } from '@preact/signals';
import type { Editor } from '../model/editor';
import { persistStorage, savePattern } from './db';
import { renderThumbnail } from '../canvas/export';

export type SaveStatus = 'saved' | 'saving' | 'error';
export const saveStatus = signal<SaveStatus>('saved');
export const saveError = signal<string>('');

const DELAY = 1000;
let persistAsked = false;

/** Writes the pattern one second after the last change, and at once when the page hides. */
export class Autosaver {
  private timer: number | undefined;
  private dirty = false;
  private editsReported = 0;
  private unsub: () => void;
  private writing: Promise<void> = Promise.resolve();

  constructor(private editor: Editor) {
    this.unsub = editor.subscribe(() => this.touch());
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Marks the pattern as needing a save. */
  touch(): void {
    this.dirty = true;
    saveStatus.value = 'saving';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), DELAY);
  }

  private onHide = () => { if (document.visibilityState === 'hidden') void this.flush(); };
  private onPageHide = () => { void this.flush(); };

  flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (!this.dirty) {
      return this.writing;
    }
    this.dirty = false;
    const pattern = this.editor.pattern;
    const edits = this.editor.edits;
    const addEdits = edits - this.editsReported;
    this.editsReported = edits;
    this.writing = this.writing.then(async () => {
      try {
        let thumb: string | undefined;
        try { thumb = renderThumbnail(pattern); } catch { /* keep the old thumbnail */ }
        await savePattern(pattern, { thumb, addEdits });
        if (!this.dirty) saveStatus.value = 'saved';
        saveError.value = '';
        if (!persistAsked) { persistAsked = true; void persistStorage(); }
      } catch (e) {
        this.dirty = true; // try again on the next change
        this.editsReported -= addEdits;
        saveStatus.value = 'error';
        saveError.value = e instanceof Error ? e.message : 'Saving failed';
      }
    });
    return this.writing;
  }

  dispose(): Promise<void> {
    this.unsub();
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
    return this.flush();
  }
}
