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

// ---- colour families for the grouped picker -------------------------------------

export const FAMILIES = ['Whites & greys', 'Reds', 'Pinks', 'Oranges', 'Yellows', 'Browns & tans', 'Greens', 'Blues', 'Purples'] as const;
export type Family = (typeof FAMILIES)[number];

function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

/** A rough hue family from the on-screen colour; good enough to browse by. */
export function familyOf(hex: string): Family {
  const { h, s, l } = hsl(hex);
  if (s < 0.14 || l < 0.07 || l > 0.96) return 'Whites & greys';
  if (h >= 345 || h < 12) return l > 0.72 ? 'Pinks' : 'Reds';
  if (h < 50 && (l < 0.55 && s < 0.7 || h < 40 && l < 0.4)) return 'Browns & tans';
  if (h < 40) return l > 0.78 && s < 0.6 && h < 25 ? 'Pinks' : 'Oranges';
  if (h < 70) return 'Yellows';
  if (h < 170) return 'Greens';
  if (h < 255) return 'Blues';
  if (h < 300) return 'Purples';
  return l > 0.7 ? 'Pinks' : 'Purples';
}

export interface FamilyGroup { family: Family; threads: Thread[] }

/** Threads grouped by family, each group from light to dark. */
export const GROUPS: FamilyGroup[] = FAMILIES.map((family) => ({
  family,
  threads: THREADS.filter((t) => familyOf(t.hex) === family).sort((a, b) => hsl(b.hex).l - hsl(a.hex).l),
}));
