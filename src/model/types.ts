export type ThreadId = string; // "dmc:310"

export interface PaletteEntry {
  id: number; // stable for the life of the pattern, never reused
  thread: ThreadId;
  symbol: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  cells: Map<number, number>; // cell key -> PaletteEntry.id
}

export interface Pattern {
  schema: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fabric: string;
  palette: PaletteEntry[];
  layers: Layer[]; // index 0 is the bottom layer
  activeLayerId: string;
  nextEntryId: number; // ids are never reused
  createdAt: number;
  updatedAt: number;
}

export const MIN_SIZE = 10;
export const MAX_SIZE = 300;
export const DEFAULT_SIZE = 100;
export const DEFAULT_FABRIC = '#F4ECD8';
