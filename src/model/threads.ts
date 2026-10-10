import dmc from '../data/dmc.json';

export interface Thread { code: string; name: string; hex: string }

export const THREADS: Thread[] = dmc as Thread[];
const byId = new Map(THREADS.map((t) => [`dmc:${t.code}`, t]));

export const threadId = (code: string): string => `dmc:${code}`;
export const getThread = (id: string): Thread | undefined => byId.get(id);

export function threadHex(id: string): string {
  return byId.get(id)?.hex ?? '#FF00FF'; // magenta marks an unknown thread
}

/** Black or white, whichever reads better on the colour. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.179 ? '#000000' : '#FFFFFF';
}

export function searchThreads(query: string): Thread[] {
  const q = query.trim().toLowerCase();
  if (!q) return THREADS;
  const exact = THREADS.filter((t) => t.code.toLowerCase() === q);
  const rest = THREADS.filter(
    (t) => t.code.toLowerCase() !== q && (t.code.toLowerCase().startsWith(q) || t.name.toLowerCase().includes(q)),
  );
  return [...exact, ...rest];
}
