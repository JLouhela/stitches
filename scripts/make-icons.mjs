// Generates the PWA icons (public/*.png) and favicon.svg. No dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};

function png(size) {
  const bg = [0xf4, 0xec, 0xd8], red = [0x7a, 0x2e, 0x2e], grid = [0xd9, 0xcf, 0xbf];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cells = 5, pad = size * 0.16, cell = (size - 2 * pad) / cells;
  const thick = cell * 0.2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = bg;
      const gx = (x - pad) / cell, gy = (y - pad) / cell;
      if (gx >= 0 && gy >= 0 && gx < cells && gy < cells) {
        const lx = (gx % 1) * cell, ly = (gy % 1) * cell;
        const onGrid = lx < 1 || ly < 1;
        if (onGrid) col = grid;
        const d1 = Math.abs(lx - ly), d2 = Math.abs(lx + ly - cell);
        const stitch = (Math.floor(gx) + Math.floor(gy)) % 2 === 0;
        if (stitch && (d1 < thick / 1.4 || d2 < thick / 1.4) && lx > cell * 0.12 && lx < cell * 0.88 && ly > cell * 0.12 && ly < cell * 0.88) col = red;
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync('public/favicon.svg',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#f4ecd8"/><path d="M8 8l16 16M24 8L8 24" stroke="#7a2e2e" stroke-width="4" stroke-linecap="round"/></svg>\n');
console.log('icons written');
