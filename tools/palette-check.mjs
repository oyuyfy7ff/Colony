// Fails if any opaque pixel in the exported sprites is not in the palette (create-game-assets QA).
// Usage: node tools/palette-check.mjs out/sprites   (reads the PNGs with a tiny decoder via playwright-free zlib)
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const src = ['../src/art/sprites.js', '../src/art/world-art.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
const pal = new Set([...src.matchAll(/#([0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase()));
function decode(buf) { // 8-bit RGBA, non-interlaced PNG (what canvas.toDataURL writes)
  let i = 8, w = 0, h = 0; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6) throw new Error('expect RGBA8'); }
    if (type === 'IDAT') idat.push(data);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4), bpr = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (bpr + 1)], line = raw.subarray(y * (bpr + 1) + 1, (y + 1) * (bpr + 1));
    for (let x = 0; x < bpr; x++) {
      const a = x >= 4 ? px[y * bpr + x - 4] : 0, b = y ? px[(y - 1) * bpr + x] : 0, c = x >= 4 && y ? px[(y - 1) * bpr + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * bpr + x] = (line[x] + pred) & 255;
    }
  }
  return px;
}
const dir = process.argv[2] || 'out/sprites';
let bad = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.png'))) {
  const px = decode(readFileSync(`${dir}/${f}`));
  const off = new Set();
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) { const hx = [px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); if (!pal.has(hx)) off.add(hx); }
  if (off.size) { bad++; console.log(`${f}: off-palette ${[...off].join(' ')}`); }
}
console.log(bad ? `FAIL ${bad} file(s)` : `palette ok (${pal.size} colours)`);
process.exit(bad ? 1 : 0);
