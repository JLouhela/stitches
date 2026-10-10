import type { Pattern } from '../model/types';
import { fromFile, toFile } from '../model/serialise';
import { uid } from '../model/pattern';
import { reidentify } from './db';

const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'pattern';

export const patternFileName = (p: Pattern) => `${safeName(p.name)}.xstitch.json`;

export function patternToBlob(p: Pattern): Blob {
  return new Blob([JSON.stringify(toFile(p))], { type: 'application/json' });
}

/**
 * Hands a file to the tablet's share sheet when possible, otherwise downloads it.
 * Returns false when the user cancelled the share sheet.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      // otherwise fall through to a download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export async function parsePatternFile(file: File): Promise<Pattern> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('This file could not be read as a pattern.');
  }
  return reidentify(fromFile(data), uid());
}

/** Opens the system file picker and resolves with the chosen file, or undefined. */
export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => { resolve(input.files?.[0]); input.remove(); };
    input.oncancel = () => { resolve(undefined); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}
