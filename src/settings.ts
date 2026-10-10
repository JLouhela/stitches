import { signal, effect, type Signal } from '@preact/signals';
import type { Tool } from './canvas/controller';

// Small settings live in localStorage under a shared prefix. Losing them costs nothing.
const PREFIX = 'xstitch:';

function read<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function persisted<T>(name: string, fallback: T): Signal<T> {
  const s = signal<T>(read(name, fallback));
  effect(() => {
    const v = s.value;
    try { localStorage.setItem(PREFIX + name, JSON.stringify(v)); } catch { /* storage unavailable */ }
  });
  return s;
}

export const lastTool = persisted<Tool>('tool', 'pencil');
export const showGrid = persisted<boolean>('grid', true);
export const fingersOnlyPan = persisted<boolean>('fingersOnlyPan', false);
export const layersOpen = persisted<boolean>('layersOpen', true);
export const exportScale = persisted<number>('exportScale', 10);
export const exportGrid = persisted<boolean>('exportGrid', false);
