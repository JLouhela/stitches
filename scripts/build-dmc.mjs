// Builds src/data/dmc.json from the committed source files in data/sources/.
// Primary source: makebead/craft-color-codes dmc-floss.json (CC BY 4.0), 489 colours,
// cross-checked against adrianj/CrossStitchCreator (via sharlagelfand/dmc, MIT).
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('data/sources/makebead-dmc-floss.json', 'utf8'));
const rows = src.colors.map((c) => ({ code: c.code, name: c.name, hex: c.hex.toUpperCase() }));

const adrian = readFileSync('data/sources/floss_adrianj.csv', 'utf8')
  .trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const known = new Set(rows.map((r) => r.code));
const missing = adrian.map((r) => r[0]).filter((c) => !known.has(c));
if (missing.length) console.log('In adrianj but not in makebead (name differs?):', missing.join(', '));

if (new Set(rows.map((r) => r.code)).size !== rows.length) throw new Error('duplicate codes');
for (const r of rows) if (!/^#[0-9A-F]{6}$/.test(r.hex)) throw new Error('bad hex ' + r.code);

writeFileSync('src/data/dmc.json', JSON.stringify(rows, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`wrote ${rows.length} colours`);
