// All art is generated at boot from tiny pixel maps, so the game ships with no image files.
// Palette based on Sweetie 16 (public domain).
import { TILE, MAP_W, MAP_H, T_WATER } from '../rules/config.js';
import { extraSprites } from './world-art.js';

export const PAL = {
  k: '#1a1c2c', b: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', l: '#a7f070',
  g: '#38b764', G: '#257179', d: '#29366f', C: '#3b5dc9', c: '#41a6f6', t: '#73eff7',
  w: '#f4f4f4', s: '#94b0c2', S: '#566c86', D: '#333c57',
  n: '#a0663a', N: '#6b3d23', p: '#f2c7a0', h: '#4a2c1a',
  m: '#9a5bd8', M: '#5d2f8e', q: '#d7b0ff',
  e: '#2e8b3d', E: '#1e5e2a', a: '#3fbe6a', // a = alternate grass checker
};

function fromRows(rows, swap = {}) {
  const h = rows.length, wdt = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = wdt; cv.height = h;
  const ctx = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = swap[row[x]] ?? row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = PAL[ch] || ch;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}
function canvas(wdt, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = wdt; cv.height = h;
  const ctx = cv.getContext('2d');
  const px = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = PAL[c] || c; ctx.fillRect(x, y, ww, hh); };
  draw(px, ctx);
  return cv;
}

const TREE = [
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
const ROCK = [
  '................',
  '................',
  '................',
  '................',
  '......kkkk......',
  '....kkssswkk....',
  '...ksswwsssSk...',
  '..ksswsssssSSk..',
  '..kssssssSSSSk..',
  '.kSsssssSSSSSSk.',
  '.kSSsssSSSSSSDk.',
  '.kDSSSSSSSSSDDk.',
  '..kDDSSSSSDDDk..',
  '...kkkkkkkkkk...',
  '................',
  '................',
];
const BUSH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkk.....',
  '..kkgglgggkk....',
  '.kgglrggggrgk...',
  'kggggggrgggGgk..',
  'kgrggggggrgGGk..',
  'kgggrggggggGGk..',
  '.kGgggGrggGGk...',
  '..kkGGGGGGkk....',
  '....kkkkkk......',
  '................',
  '................',
];
const VILLAGER = [
  '...kkkk...',
  '..khhhhk..',
  '.khhpphk..',
  '..kpkpkk..',
  '..kppppk..',
  '...kkkk...',
  '..kcccck..',
  '.kpccccpk.',
  '.kpccccpk.',
  '..kcccck..',
];
const LEGS_A = ['..kNkkNk..', '..kk..kk..'];
const LEGS_B = ['...kNNk...', '...kkkk...'];
const LEGS_SIT = ['.kNNNNNNk.', '.kkkkkkkk.'];
const SLIME = [
  '....kkkk....',
  '..kkqqqqkk..',
  '.kqqwqqqqqk.',
  '.kqwwmmmmMk.',
  'kmmmmkmmkmMk',
  'kmmmmkmmkmMk',
  'kMmmmmmmmmMk',
  'kMMMMMMMMMMk',
  '.kkkkkkkkkk.',
];
const GOBLIN = [
  '.k........k.',
  '.kek.kkk.kek',
  '..kekeeekek.',
  '...keeeeek..',
  '...kererek..',
  '...keeeeek..',
  '....kekek...',
  '...kkkkkkk..',
  '..keknnnkek.',
  '..keknnnkek.',
  '...kknnnkk..',
];
const BAT_A = [
  'k..........k',
  'kk........kk',
  'kbk.kkkk.kbk',
  'kbbkbbbbkbbk',
  '.kbbrbbrbbk.',
  '..kbbbbbbk..',
  '...kwkkwk...',
  '....k..k....',
];
const BAT_B = [
  '............',
  '....kkkk....',
  '...kbbbbk...',
  'kkkbrbbrbkkk',
  'kbbbbbbbbbbk',
  '.kbkbbbbkbk.',
  '..k.kwwk.k..',
  '.....kk.....',
];
const GOB_A = ['...kNk.kNk..', '...kk...kk..'];
const GOB_B = ['....kNNNk...', '....kkkkk...'];
const HOUSE = [
  '.......kk..kkk..',
  '......krrk.knk..',
  '.....krorrkknk..',
  '....krrrrrrkkk..',
  '...krrrrrorrk...',
  '..krorrrrrrrrk..',
  '.kkkkkkkkkkkkkk.',
  '..knnnnnnnnnnk..',
  '..knkkknnkkknk..',
  '..knkyknnkyknk..',
  '..knkkkkkkkknk..',
  '..knnnkNNknnnk..',
  '..knnnkNNknnnk..',
  '..knnnkNNknnnk..',
  '..kkkkkkkkkkkk..',
  '................',
];
const ICON_WOOD = ['..kkkk', '.knnNk', 'knnnNk', 'kyNnNk', 'kNnNk.', 'kkkk..'];
const ICON_STONE = ['.kkkk.', 'kswssk', 'kssSSk', 'kSSSSk', 'kDSSDk', '.kkkk.'];
const ICON_FOOD = ['...kg.', '.kkkk.', 'krrork', 'krrrrk', 'kbrrbk', '.kkkk.'];
const ICON_POP = ['.kkk..', 'khhhk.', 'kppk..', '.kk...', 'kcck..', 'kcck..'];

const SHIRTS = ['c', 'r', 'o', 'l'];

// UI icons (8x8 unless noted): the HUD uses these instead of emoji or font symbols.
const UI = {
  sun: ['y..y..y.', '.y.y.y..', '..yyy...', 'yyyoyyy.', '..yyy...', '.y.y.y..', 'y..y..y.', '........'],
  moon: ['..kkkk..', '.kyyyk..', 'kyyyk...', 'kyyk....', 'kyyk....', 'kyyyk...', '.kyyyykk', '..kkkk..'],
  fed: ['........', '..kkkk..', '.knyynk.', 'knyyyynk', 'knnnnnnk', 'knnnnnnk', '.kkkkkk.', '........'],
  hungry: ['........', '........', 'kkkkkkkk', 'kwsssswk', '.kwsswk.', '..kkkk..', '........', '........'],
  home: ['...kk...', '..kwwk..', '.kwwwwk.', 'kwwwwwwk', '.kwkkwk.', '.kwkkwk.', '.kwkkwk.', '.kkkkkk.'],
  play: ['.k......', '.kk.....', '.kwk....', '.kwwk...', '.kwwwk..', '.kwwk...', '.kwk....', '.kk.....', '.k......'],
  pause: ['........', 'kkk.kkk.', 'kwk.kwk.', 'kwk.kwk.', 'kwk.kwk.', 'kwk.kwk.', 'kkk.kkk.', '........'],
  menu: ['........', 'kkkkkkkk', 'kwwwwwwk', 'kkkkkkkk', 'kwwwwwwk', 'kkkkkkkk', 'kwwwwwwk', 'kkkkkkkk'],
  close: ['kk....kk', 'kwk..kwk', '.kwkkwk.', '..kwwk..', '..kwwk..', '.kwkkwk.', 'kwk..kwk', 'kk....kk'],
  full: ['kkkk.kkkk', 'kwwk.kwwk', 'kwkk.kkwk', 'kkk...kkk', '.........', 'kkk...kkk', 'kwkk.kkwk', 'kwwk.kwwk', 'kkkk.kkkk'],
  arrow: ['...k....', '...kk...', 'kkkkwk..', 'kwwwwwk.', 'kwwwwwk.', 'kkkkwk..', '...kk...', '...k....'],
  heart: ['.kk.kk..', 'krrkrrk.', 'krorrrk.', 'krrrrrk.', '.krrrk..', '..krk...', '...k....', '........'],
  music: ['...kkkk.', '...kwwk.', '...k..k.', '...k..k.', '.kkk.kk.', 'kwwkkwwk', 'kwwkkwwk', '.kk..kk.'],
  sound: ['...k....', '..kk..k.', 'kkwk.k..', 'kwwk.k.k', 'kwwk.k.k', 'kkwk.k..', '..kk..k.', '...k....'],
  shake: ['k.kkkk.k', 'k.kwwk.k', '.kkwwkk.', 'k.kwwk.k', 'k.kwwk.k', '.kkwwkk.', 'k.kwwk.k', 'k.kkkk.k'],
  flash: ['...y....', '...y....', '..yyy...', 'yyywyyy.', '..yyy...', '...y....', '...y....', '........'],
  axe: ['..kkk...', '.kssk...', 'kssnk...', '.kknk...', '...kn...', '....kn..', '.....kn.', '......k.'],
  bow: ['..kk....', '.kn.k...', 'kn...k..', 'kn.kkkkk', 'kn...k..', '.kn.k...', '..kk....', '........'],
  hand: ['...k....', '..kwk...', '..kwk...', '..kwkkk.', 'kkkwwwwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  hammer: ['.kkkkk..', 'kssssk..', 'kssskk..', '.kkknk..', '....kn..', '.....kn.', '......kn', '.......k'],
  auto: ['..kkkk..', '.kyyyyk.', 'kyk..kyk', 'ky....kk', 'kk....yk', 'kyk..kyk', '.kyyyyk.', '..kkkk..'],
  road: ['kkkkkkkk', 'ksSksSSk', 'kSSkSSsk', 'kkkkkkkk', 'kSsSkSSk', 'kSSSksSk', 'kkkkkkkk', '........'],
  person: ['..kkkk..', '.khhhhk.', '.khppk..', '..kppk..', '.kcccck.', 'kpccccpk', '.kcccck.', '.kk..kk.'],
  phone: ['kkkkkkkkkkkkkkkk', 'kDDDDDDDDDDDDDDk', 'kDccccccccccccDk', 'kDccccccccccccDk', 'kDccccccccccccwk', 'kDccccccccccccDk', 'kDccccccccccccDk', 'kDDDDDDDDDDDDDDk', 'kkkkkkkkkkkkkkkk'],
};
const rot = (rows, turns) => { let r = rows; for (let t = 0; t < turns; t++) r = r[0].split('').map((_, x) => r.map((row) => row[x]).reverse().join('')); return r; };
UI.arrowE = UI.arrow; UI.arrowS = rot(UI.arrow, 1); UI.arrowW = rot(UI.arrow, 2); UI.arrowN = rot(UI.arrow, 3);

function farm() {
  return canvas(16, 16, (px) => {
    px(1, 2, 'k', 14, 13);
    px(2, 3, 'N', 12, 11);
    for (let y = 4; y < 14; y += 3) {
      px(2, y, 'n', 12, 1);
      for (let x = 3; x < 13; x += 3) { px(x, y - 1, 'g'); px(x, y - 2, 'l'); px(x + 1, y - 1, 'e'); }
    }
    for (let x = 0; x < 16; x += 3) { px(x, 1, 'n', 1, 3); px(x, 13, 'n', 1, 3); }
    px(0, 2, 'n', 16, 1); px(0, 14, 'n', 16, 1);
    px(10, 5, 'y'); px(4, 8, 'y'); px(7, 11, 'y');
  });
}
function wall() {
  return canvas(16, 16, (px) => {
    px(0, 2, 'k', 16, 14);
    px(1, 3, 's', 14, 12);
    const rows = [[3, 0], [6, 4], [9, 0], [12, 4]];
    for (const [y, off] of rows) {
      px(1, y + 2, 'D', 14, 1);
      for (let x = off + 1; x < 15; x += 8) px(x, y, 'D', 1, 2);
      px(1, y, 'w', 14, 1);
    }
    px(1, 14, 'S', 14, 1);
  });
}
function tower() {
  return canvas(16, 28, (px) => {
    px(3, 8, 'k', 10, 20);
    px(4, 9, 's', 8, 18);
    for (let y = 11; y < 27; y += 4) { px(4, y, 'S', 8, 1); px(7 + ((y >> 2) % 2) * 2, y - 2, 'S', 1, 2); }
    px(7, 14, 'k', 2, 4);
    px(4, 26, 'S', 8, 1);
    // wooden top
    px(1, 5, 'k', 14, 4);
    px(2, 6, 'n', 12, 2);
    px(2, 7, 'N', 12, 1);
    for (let x = 1; x < 15; x += 4) { px(x, 1, 'k', 3, 5); px(x + 1, 2, 'n', 1, 3); }
    // flag
    px(8, 0, 'k', 1, 2);
  });
}
function hallArt() {
  return canvas(32, 34, (px) => {
    // stone base
    px(1, 14, 'k', 30, 20);
    px(2, 15, 's', 28, 18);
    for (let y = 18; y < 33; y += 4) px(2, y, 'S', 28, 1);
    // timber upper
    px(3, 10, 'k', 26, 6);
    px(4, 11, 'n', 24, 4);
    for (let x = 4; x < 28; x += 5) px(x, 11, 'N', 1, 4);
    // roof
    for (let i = 0; i < 8; i++) {
      const x0 = 7 - (i >> 1), wd = 32 - x0 * 2;
      px(x0 - 1, 2 + i, 'k', wd + 2, 2);
    }
    for (let i = 0; i < 8; i++) {
      const x0 = 7 - (i >> 1), wd = 32 - x0 * 2;
      px(x0, 3 + i, i % 3 === 0 ? 'o' : 'r', wd, 1);
    }
    px(2, 10, 'k', 28, 1);
    // door + windows
    px(13, 23, 'k', 6, 11);
    px(14, 24, 'N', 4, 10);
    px(16, 24, 'h', 1, 10);
    px(5, 20, 'k', 5, 5); px(6, 21, 'y', 3, 3);
    px(22, 20, 'k', 5, 5); px(23, 21, 'y', 3, 3);
    // banner
    px(15, 0, 'k', 1, 4);
    px(16, 0, 'r', 4, 2); px(16, 1, 'o', 3, 1);
  });
}
function site() {
  return canvas(16, 16, (px) => {
    px(1, 13, 'N', 14, 2);
    for (const x of [2, 13]) px(x, 3, 'n', 1, 11);
    px(1, 3, 'n', 14, 1); px(1, 8, 'n', 14, 1);
    for (let i = 0; i < 10; i++) px(3 + i, 4 + ((i * 0.5) | 0), 'N');
    px(5, 11, 's', 4, 2); px(9, 12, 'n', 4, 1);
  });
}
function arrow() {
  return canvas(7, 3, (px) => { px(0, 1, 'n', 5, 1); px(5, 0, 's', 1, 3); px(6, 1, 's'); px(0, 0, 'w'); px(0, 2, 'w'); });
}
function glow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,205,117,0.9)');
  g.addColorStop(0.4, 'rgba(255,170,90,0.35)');
  g.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return cv;
}
function shadow() {
  return canvas(10, 4, (px) => { px(2, 0, 'rgba(0,0,0,0.28)', 6, 4); px(0, 1, 'rgba(0,0,0,0.28)', 2, 2); px(8, 1, 'rgba(0,0,0,0.28)', 2, 2); });
}
function puff() {
  return canvas(4, 4, (px) => { px(1, 0, 'w', 2, 4); px(0, 1, 'w', 4, 2); });
}

// Ground: one big canvas painted once from the terrain grid.
export function paintGround(world) {
  const cv = document.createElement('canvas');
  cv.width = MAP_W * TILE; cv.height = MAP_H * TILE;
  const ctx = cv.getContext('2d');
  const px = (x, y, c, ww = 1, hh = 1) => { ctx.fillStyle = PAL[c] || c; ctx.fillRect(x, y, ww, hh); };
  let s = world.seed | 0;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  const water = (x, y) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? false : world.terrain[y * MAP_W + x] === T_WATER;
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const X = tx * TILE, Y = ty * TILE;
    if (water(tx, ty)) {
      px(X, Y, 'C', TILE, TILE);
      for (let k = 0; k < 2; k++) px(X + ((r() * 12) | 0), Y + ((r() * 14) | 0), 'c', 3, 1);
      if (!water(tx, ty - 1)) { px(X, Y, 'c', TILE, 2); px(X, Y, 't', TILE, 1); }
      continue;
    }
    px(X, Y, (tx + ty) % 2 ? 'a' : 'g', TILE, TILE);
    for (let k = 0; k < 5; k++) px(X + ((r() * 15) | 0), Y + ((r() * 15) | 0), r() < 0.5 ? 'e' : 'l', 1, r() < 0.4 ? 2 : 1);
    if (r() < 0.07) { const fx = X + 3 + ((r() * 9) | 0), fy = Y + 3 + ((r() * 9) | 0); px(fx, fy, r() < 0.5 ? 'w' : 'y'); px(fx, fy + 1, 'e'); }
    // sandy shore
    if (water(tx, ty + 1)) px(X, Y + 13, 'y', TILE, 3);
    if (water(tx - 1, ty)) px(X, Y, 'y', 2, TILE);
    if (water(tx + 1, ty)) px(X + 14, Y, 'y', 2, TILE);
    if (water(tx, ty - 1)) px(X, Y, 'y', TILE, 2);
  }
  return cv;
}

// Every world sprite as a named canvas.
function spriteCanvases() {
  const out = {
    rock: fromRows(ROCK), bush: fromRows(BUSH), bush_empty: fromRows(BUSH, { r: 'g' }), house: fromRows(HOUSE),
    farm: farm(), wall: wall(), tower: tower(), hall: hallArt(), site: site(), arrow: arrow(), shadow: shadow(), puff: puff(),
    slime: fromRows(SLIME), bat_0: fromRows(BAT_A), bat_1: fromRows(BAT_B),
    goblin_0: fromRows([...GOBLIN, ...GOB_A]), goblin_1: fromRows([...GOBLIN, ...GOB_B]),
    ic_wood: fromRows(ICON_WOOD), ic_stone: fromRows(ICON_STONE), ic_food: fromRows(ICON_FOOD),
  };
  SHIRTS.forEach((c, i) => { out[`vill${i}_0`] = fromRows([...VILLAGER, ...LEGS_A], { c }); out[`vill${i}_1`] = fromRows([...VILLAGER, ...LEGS_B], { c }); });
  return { ...out, ...extraSprites(VILLAGER, SHIRTS, LEGS_SIT) };
}

// Packs all sprites into one atlas texture 'A' (shelf packing, 1px gaps) so the world draws in a
// few batches instead of one draw call per texture switch (performance-optimization skill).
export function makeTextures(textures) {
  const all = spriteCanvases();
  const names = Object.keys(all).sort((p, q) => all[q].height - all[p].height);
  const W = 256; let x = 0, y = 0, rowH = 0; const pos = {};
  for (const n of names) { const c = all[n]; if (x + c.width > W) { x = 0; y += rowH + 1; rowH = 0; } pos[n] = [x, y]; x += c.width + 1; rowH = Math.max(rowH, c.height); }
  const atlas = document.createElement('canvas'); atlas.width = W; atlas.height = y + rowH;
  const ctx = atlas.getContext('2d');
  for (const n of names) ctx.drawImage(all[n], pos[n][0], pos[n][1]);
  for (const k of ['A', 'glow']) if (textures.exists(k)) textures.remove(k);
  const tex = textures.addCanvas('A', atlas);
  for (const n of names) tex.add(n, 0, pos[n][0], pos[n][1], all[n].width, all[n].height);
  textures.addCanvas('glow', glow());
  return names;
}

// Every generated texture as a canvas, for the asset QA export (tools/export-sprites.cjs).
export function allSprites() {
  return spriteCanvases();
}

// Data-URLs scaled up crisply, for the HTML HUD.
const iconCache = new Map();
export function iconURL(name, scale = 4) {
  const ck = name + '@' + scale;
  if (iconCache.has(ck)) return iconCache.get(ck);
  const src = {
    wood: fromRows(ICON_WOOD), stone: fromRows(ICON_STONE), food: fromRows(ICON_FOOD), pop: fromRows(ICON_POP),
    house: fromRows(HOUSE), farm: farm(), tower: tower(), wall: wall(),
    slime: fromRows(SLIME), goblin: fromRows([...GOBLIN, ...GOB_A]), bat: fromRows(BAT_A),
    vill0: fromRows([...VILLAGER, ...LEGS_A], { c: SHIRTS[0] }), vill1: fromRows([...VILLAGER, ...LEGS_A], { c: SHIRTS[1] }),
    vill2: fromRows([...VILLAGER, ...LEGS_A], { c: SHIRTS[2] }), vill3: fromRows([...VILLAGER, ...LEGS_A], { c: SHIRTS[3] }),
  }[name] || (UI[name] && fromRows(UI[name]));
  if (!src) throw new Error(`no icon ${name}`);
  const cv = document.createElement('canvas');
  cv.width = src.width * scale; cv.height = src.height * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL();
  iconCache.set(ck, url);
  return url;
}
export const icon = (name, cls = 'ic') => `<img class="${cls}" src="${iconURL(name, 4)}" alt="">`;
export const UI_ICONS = Object.keys(UI);
export function uiIconCanvases() {
  return Object.fromEntries(UI_ICONS.map((k) => [`ui_${k}`, fromRows(UI[k])]));
}
