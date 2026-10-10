import type { Pattern } from '../model/types';
import { composite } from '../model/pattern';
import { keyX, keyY } from '../model/key';
import { threadHex } from '../model/threads';

function entryColours(p: Pattern): Map<number, string> {
  return new Map(p.palette.map((e) => [e.id, threadHex(e.thread)]));
}

/** Draws the composite at the given pixels per stitch. */
export function renderComposite(p: Pattern, scale: number, grid: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width * scale;
  canvas.height = p.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = p.fabric;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const colours = entryColours(p);
  for (const [k, v] of composite(p)) {
    ctx.fillStyle = colours.get(v) ?? '#FF00FF';
    ctx.fillRect(keyX(k) * scale, keyY(k) * scale, scale, scale);
  }
  if (grid && scale >= 4) {
    ctx.lineWidth = 1;
    for (let i = 0; i <= p.width; i++) {
      ctx.strokeStyle = i % 10 === 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(i * scale + 0.5, 0);
      ctx.lineTo(i * scale + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j <= p.height; j++) {
      ctx.strokeStyle = j % 10 === 0 ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, j * scale + 0.5);
      ctx.lineTo(canvas.width, j * scale + 0.5);
      ctx.stroke();
    }
  }
  return canvas;
}

export function renderThumbnail(p: Pattern, max = 160): string {
  const scale = Math.max(1, Math.floor(max / Math.max(p.width, p.height)));
  return renderComposite(p, scale, false).toDataURL('image/png');
}

export function renderPng(p: Pattern, scale: number, grid: boolean): Promise<Blob> {
  const canvas = renderComposite(p, scale, grid);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'),
  );
}
