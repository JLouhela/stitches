/** Coordinates may be negative or past the edge, so pack with an offset. */
export const key = (x: number, y: number): number => (y + 32768) * 65536 + (x + 32768);
export const keyX = (k: number): number => (k % 65536) - 32768;
export const keyY = (k: number): number => Math.floor(k / 65536) - 32768;
