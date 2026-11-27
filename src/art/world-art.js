// Living-world art: ground with grass zones, worn paths and roads, swaying trees, saplings,
// flowers, critters, smoke, emote bubbles and pixel digits. Same palette and outline rules as
// sprites.js (see docs/art/art-direction.md).
import { TILE, MAP_W, MAP_H, T_WATER } from '../rules/config.js';

export const PAL2 = {
  k: '#1a1c2c', b: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', l: '#a7f070',
  g: '#38b764', G: '#257179', d: '#29366f', C: '#3b5dc9', c: '#41a6f6', t: '#73eff7',
  w: '#f4f4f4', s: '#94b0c2', S: '#566c86', D: '#333c57',
  n: '#a0663a', N: '#6b3d23', p: '#f2c7a0', h: '#4a2c1a',
  m: '#9a5bd8', M: '#5d2f8e', q: '#d7b0ff',
  e: '#2e8b3d', E: '#1e5e2a', a: '#3fbe6a',
  u: '#c8925a', // u = sun-dried dirt for worn paths
  v: '#33a24f', A: '#48c36c', // v, A = in-between grass shades so zones blend softly
};
const hex = (c) => { const v = PAL2[c] || c; return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]; };

export function rows(rws, swap = {}) {
  const h = rws.length, w = Math.max(...rws.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  rws.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = swap[row[x]] ?? row[x]; if (ch === '.' || ch === ' ') continue; ctx.fillStyle = PAL2[ch] || ch; ctx.fillRect(x, y, 1, 1); } });
  return cv;
}
const shift = (rws, from, to, dx) => rws.map((r, i) => (i >= from && i <= to ? (dx > 0 ? '.' + r.slice(0, -1) : r.slice(1) + '.') : r));

// ---------- trees ----------
export const TREE_ROWS = [
  '.....kkkkk......',
  '...kkglllgkk....',
  '..kglllggggGk...',
  '.kglllgggggGGk..',
  '.kgllgggggggGk..',
  'kggggggggggGGGk.',
  'kgggggggggGGGGk.',
  'kGggggggggGGGGk.',
  '.kGGgggggGGGGk..',
  '..kGGGGGGGGGk...',
  '...kkkGnGkkk....',
  '......knNk......',
  '......knNk......',
  '.....kknNkk.....',
  '....kNNNNNNk....',
  '.....kkkkkk.....',
];
const SAPLING = ['...kk...', '..kglk..', '.kglgGk.', '..kGGk..', '...kn...', '...kn...', '..kNNk..', '...kk...'];
const YOUNG = [
  '....kkkk....', '..kkgllgkk..', '.kglllgggGk.', 'kgllggggggGk', 'kggggggggGGk', '.kGgggggGGk.',
  '..kkGGGGkk..', '.....kn.....', '.....kn.....', '....knNk....', '....kNNk....', '.....kk.....',
];

// ---------- small nature ----------
const FLOWER = (c) => [['.c.', 'cyc', '.c.', '.e.', 'ee.'], ['.c..', 'cyc.', '.c..', '..e.', '.ee.']].map((f) => f.map((r) => r.replace(/c/g, c)));
const MUSHROOM = ['.kkk.', 'krwrk', 'krrrk', '.kwk.', '.kkk.'];
const TUFT = [['e.e..', 'e.e.e', 'eeeae', '.eae.'], ['.e.e.', 'e.e.e', 'eeeae', '.eae.']];
const PEBBLE = ['.SS.', 'SsSD', '.DD.'];
const BUTTERFLY = (c) => [['c.c', 'ckc', '.k.'], ['...', 'ckc', '.k.']].map((f) => f.map((r) => r.replace(/c/g, c)));
const BIRD = [['k.....k', '.k...k.', '..kkk..'], ['.......', 'kkk.kkk', '..kkk..']];
const SPARKLE = [['.w.', 'wtw', '.w.'], ['...', '.t.', '...']];

// ---------- construction stages ----------
function stage(n) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const x = cv.getContext('2d'); const px = (a, b, c, w = 1, h = 1) => { x.fillStyle = PAL2[c]; x.fillRect(a, b, w, h); };
  px(1, 13, 'N', 14, 2); // dug foundation
  for (const sx of [1, 14]) px(sx, 11, 'n', 1, 4);
  if (n === 0) { px(1, 11, 'w', 14, 1); px(4, 12, 's', 3, 1); px(9, 12, 'n', 4, 1); return cv; } // stakes and string
  for (const sx of [2, 13]) px(sx, 3, 'n', 1, 11);
  px(1, 3, 'n', 14, 1); px(1, 8, 'n', 14, 1);
  for (let i = 0; i < 10; i++) px(3 + i, 4 + (i >> 1), 'N');
  if (n === 1) { px(5, 11, 's', 4, 2); return cv; }
  px(3, 9, 'n', 10, 4); for (let i = 3; i < 13; i += 3) px(i, 9, 'N', 1, 4); px(3, 9, 'k', 10, 1); // half walls
  px(5, 11, 'k', 2, 2);
  return cv;
}

// ---------- emote bubbles (no emoji: pixel icons inside a speech bubble) ----------
const EMO = {
  heart: ['.rr.rr.', 'rorrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  alert: ['..rr..', '..rr..', '..rr..', '..rr..', '......', '..rr..'],
  note: ['...kk', '...kk', '...k.', '.kkk.', 'kkkk.', '.kk..'],
  talk: ['.......', '.......', 'k.k.k..', '.......', '.......', '.......'],
  sad: ['...c...', '..ccc..', '.ccccc.', '.cctcc.', '..ccc..', '.......'],
  star: ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'],
  wave: ['k.k.k.', 'kpkpkp', 'kpppp.', 'kpppk.', '.kkk..', '......'],
};
function bubble(icon) {
  const cv = document.createElement('canvas'); cv.width = 11; cv.height = 11;
  const x = cv.getContext('2d'); const px = (a, b, c, w = 1, h = 1) => { x.fillStyle = PAL2[c]; x.fillRect(a, b, w, h); };
  px(1, 0, 'k', 9, 1); px(0, 1, 'k', 1, 7); px(10, 1, 'k', 1, 7); px(1, 8, 'k', 9, 1);
  px(1, 1, 'w', 9, 7); px(4, 9, 'k', 3, 1); px(5, 9, 'w', 1, 1); px(5, 10, 'k', 1, 1); // tail
  const ic = EMO[icon];
  const ox = 1 + ((9 - ic[0].length) >> 1), oy = 1 + ((7 - ic.length) >> 1);
  ic.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') px(ox + i, oy + j, r[i]); });
  return cv;
}
export const EMOTES = Object.keys(EMO);

// ---------- pixel digits for "+5" pops ----------
const DIG = {
  0: ['www', 'w.w', 'w.w', 'w.w', 'www'], 1: ['.w.', 'ww.', '.w.', '.w.', 'www'], 2: ['www', '..w', 'www', 'w..', 'www'],
  3: ['www', '..w', '.ww', '..w', 'www'], 4: ['w.w', 'w.w', 'www', '..w', '..w'], 5: ['www', 'w..', 'www', '..w', 'www'],
  6: ['www', 'w..', 'www', 'w.w', 'www'], 7: ['www', '..w', '.w.', '.w.', '.w.'], 8: ['www', 'w.w', 'www', 'w.w', 'www'],
  9: ['www', 'w.w', 'www', '..w', 'www'], p: ['...', '.w.', 'www', '.w.', '...'],
};
function digit(d) { // white digit with a 1px dark outline, 5x7
  const g = DIG[d];
  const cv = document.createElement('canvas'); cv.width = 5; cv.height = 7;
  const x = cv.getContext('2d');
  x.fillStyle = PAL2.k;
  g.forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === 'w') for (const [a, b] of [[0, 1], [1, 0], [1, 2], [2, 1], [1, 1], [0, 0], [2, 2], [0, 2], [2, 0]]) x.fillRect(i + a, j + b, 1, 1); });
  x.fillStyle = PAL2.w;
  g.forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === 'w') x.fillRect(i + 1, j + 1, 1, 1); });
  return cv;
}

function softShadow(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0.25)';
  for (let j = 0; j < h; j++) { const t = 1 - ((j - (h - 1) / 2) / (h / 2)) ** 2; const half = Math.round((w / 2) * Math.sqrt(Math.max(0, t))); x.fillRect(Math.round(w / 2 - half), j, half * 2, 1); }
  return cv;
}

export function extraSprites(villagerRows, shirts, legsSit) {
  const out = {};
  out.tree = rows(TREE_ROWS);
  out.tree_a = rows(shift(TREE_ROWS, 0, 8, -1));
  out.tree_b = rows(shift(TREE_ROWS, 0, 8, 1));
  out.sapling = rows(SAPLING);
  out.tree_young = rows(YOUNG);
  out.tree_young_a = rows(shift(YOUNG, 0, 5, -1));
  out.tree_young_b = rows(shift(YOUNG, 0, 5, 1));
  for (const c of ['w', 'y', 'q', 'o']) FLOWER(c).forEach((f, i) => { out[`flower_${c}_${i}`] = rows(f); });
  out.mushroom = rows(MUSHROOM);
  TUFT.forEach((f, i) => { out[`tuft_${i}`] = rows(f); });
  out.pebble = rows(PEBBLE);
  for (const c of ['y', 'q', 'w']) BUTTERFLY(c).forEach((f, i) => { out[`bfly_${c}_${i}`] = rows(f); });
  BIRD.forEach((f, i) => { out[`bird_${i}`] = rows(f); });
  SPARKLE.forEach((f, i) => { out[`sparkle_${i}`] = rows(f); });
  out.firefly = rows(['yy', 'yy']);
  out.dust = rows(['uu', 'uu']);
  out.smoke = rows(['.ss.', 'swss', 'ssss', '.ss.']);
  for (let n = 0; n < 3; n++) out[`site_${n}`] = stage(n);
  for (const k of EMOTES) out[`emo_${k}`] = bubble(k);
  for (const d of Object.keys(DIG)) out[`dg_${d}`] = digit(d);
  out.shadow_l = softShadow(16, 5);
  out.shadow_xl = softShadow(30, 7);
  shirts.forEach((c, i) => { out[`vill${i}_sit`] = rows([...villagerRows, ...legsSit], { c }); });
  return out;
}

// ---------- ground ----------
function noise(seed, scale) {
  const gw = Math.ceil(MAP_W / scale) + 3, gh = Math.ceil(MAP_H / scale) + 3;
  let s = seed | 0; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const g = Array.from({ length: gw * gh }, r);
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => { // x, y in tiles (fractional ok)
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// Paints the static ground once: grass in light/mid/deep zones with dithered borders, blades,
// tiny meadow flowers, sandy shores, deep and shallow water, and a cobbled plaza at the hall.
export function paintGround2(world, plaza) {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H), D = img.data;
  const zone = noise(world.seed ^ 0x3333, 6), fine = noise(world.seed ^ 0x7777, 1.3), meadow = noise(world.seed ^ 0x2468, 4);
  const water = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && world.terrain[y * MAP_W + x] === T_WATER;
  let s = world.seed | 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const [R, G, B] = typeof c === 'string' ? hex(c) : c; const i = (y * W + x) * 4; D[i] = R; D[i + 1] = G; D[i + 2] = B; D[i + 3] = 255; };
    const isPlaza = (tx, ty) => plaza.has(tx + ',' + ty);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
    if (water(tx, ty)) {
      put(x, y, 'C'); // one even water colour; ripples and sparkles give it life
      continue;
    }
    // grass: zone value + fine noise, dithered on a checkerboard at the band edges
    // ragged (not checkered) borders: the fine noise wobbles the zone edge
    const v = zone(x / 16, y / 16) * 0.82 + fine(x / 16, y / 16) * 0.18;
    put(x, y, v < 0.36 ? 'v' : v < 0.66 ? 'g' : 'A');
  }
  ctx.putImageData(img, 0, 0);
  const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = PAL2[c] || c; ctx.fillRect(x, y, w, h); };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const X = tx * TILE, Y = ty * TILE;
    if (water(tx, ty)) {
      if (rnd() < 0.5) px(X + ((rnd() * 12) | 0), Y + ((rnd() * 14) | 0), 'c', 3, 1);
      if (!water(tx, ty - 1)) { px(X, Y, 'c', TILE, 2); px(X, Y, 't', TILE, 1); }
      continue;
    }
    if (isPlaza(tx, ty)) {
      // packed-earth plaza with a few worn flagstones, ragged where it meets the grass
      const edge = (dx, dy) => !isPlaza(tx + dx, ty + dy);
      px(X, Y, 'u', TILE, TILE);
      for (let k = 0; k < 10; k++) px(X + ((rnd() * 15) | 0), Y + ((rnd() * 15) | 0), rnd() < 0.5 ? 'n' : 'y');
      for (let k = 0; k < 2; k++) { const fx = X + 2 + ((rnd() * 9) | 0), fy = Y + 2 + ((rnd() * 9) | 0); px(fx, fy, 'S', 5, 4); px(fx, fy, 's', 4, 3); }
      if (edge(-1, 0)) for (let j = 0; j < TILE; j += 2) px(X, Y + j, 'g', 1 + ((rnd() * 2) | 0), 2);
      if (edge(1, 0)) for (let j = 0; j < TILE; j += 2) { const w = 1 + ((rnd() * 2) | 0); px(X + TILE - w, Y + j, 'g', w, 2); }
      if (edge(0, -1)) for (let i = 0; i < TILE; i += 2) px(X + i, Y, 'g', 2, 1 + ((rnd() * 2) | 0));
      if (edge(0, 1)) for (let i = 0; i < TILE; i += 2) { const h = 1 + ((rnd() * 2) | 0); px(X + i, Y + TILE - h, 'g', 2, h); }
      continue;
    }
    // grass blades: darker strokes with a light tip, denser in lush zones
    const lush = zone(tx + 0.5, ty + 0.5);
    const blades = lush > 0.6 ? 7 : lush > 0.4 ? 4 : 2;
    for (let k = 0; k < blades; k++) { const bx = X + ((rnd() * 15) | 0), by = Y + ((rnd() * 14) | 0); px(bx, by + 1, 'E'); px(bx, by, lush > 0.6 ? 'l' : 'e'); }
    // tiny meadow flowers only in meadow zones (clearings stay plain)
    if (meadow(tx, ty) > 0.68 && rnd() < 0.5) for (let k = 0; k < 3; k++) px(X + 2 + ((rnd() * 12) | 0), Y + 2 + ((rnd() * 12) | 0), ['w', 'y', 'q'][(rnd() * 3) | 0]);
    // sandy shores
    if (water(tx, ty + 1)) { px(X, Y + 12, 'y', TILE, 4); px(X, Y + 12, 'u', TILE, 1); }
    if (water(tx - 1, ty)) px(X, Y, 'y', 3, TILE);
    if (water(tx + 1, ty)) px(X + 13, Y, 'y', 3, TILE);
    if (water(tx, ty - 1)) px(X, Y, 'y', TILE, 3);
  }
  return cv;
}

// One tile of the dynamic path layer: 0 nothing, 1 trampled, 2 dirt path, 3 stone road.
// Edges are ragged where the neighbour is not a path, so paths blend into the grass.
export function paintPathTile(ctx, tx, ty, level, nb, seed) {
  const X = tx * TILE, Y = ty * TILE;
  ctx.clearRect(X, Y, TILE, TILE);
  if (!level) return;
  let s = (seed ^ (tx * 73856093) ^ (ty * 19349663)) | 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = PAL2[c] || c; ctx.fillRect(x, y, w, h); };
  if (level === 1) { for (let k = 0; k < 6; k++) px(X + 2 + ((rnd() * 12) | 0), Y + 2 + ((rnd() * 12) | 0), 'v', 2, 1); return; } // trampled: flattened darker grass
  const inset = (side) => (nb[side] >= 2 ? 0 : 2 + ((rnd() * 2) | 0));
  const l = inset('l'), r = inset('r'), t = inset('t'), b = inset('b');
  if (level === 2) {
    px(X + l, Y + t, 'u', TILE - l - r, TILE - t - b);
    for (let k = 0; k < 9; k++) px(X + l + ((rnd() * (TILE - l - r - 1)) | 0), Y + t + ((rnd() * (TILE - t - b - 1)) | 0), rnd() < 0.6 ? 'n' : 'y');
    return;
  }
  // road: square pavers
  px(X + l, Y + t, 'D', TILE - l - r, TILE - t - b);
  for (let cy = Y + t + 1; cy < Y + TILE - b - 2; cy += 5) for (let cx = X + l + 1 + ((cy >> 2) & 1) * 2; cx < X + TILE - r - 2; cx += 5) { px(cx, cy, 's', 4, 4); px(cx, cy + 3, 'S', 4, 1); }
}
