// Cozy art pass: warm greens, big leafy and blossom trees, detailed 2x2 cottages with shingled
// roofs and window boxes, fenced crop fields, taller villagers with varied hair, fences and
// flower beds. Original pixel art drawn in code (style direction: cozy farming village).

export const COZY = {
  // grass
  grassL: '#78c446', grassM: '#6cbd40', grassD: '#62b33c', clump: '#4a9c38', clumpRim: '#86cc4f', blade: '#4a9a36', bladeHi: '#a6dc6a',
  // leaves
  leafHi: '#a8dc5e', leafL: '#7cc44a', leafM: '#55a43a', leafD: '#357f35', leafS: '#225a2e', leafOut: '#183f25',
  // blossom
  bloHi: '#fff0f7', bloL: '#ffc6e3', bloM: '#f39ac8', bloD: '#cf6aa8', bloS: '#9c4b86', bloOut: '#5e2a52',
  // wood and bark
  bark: '#7a4a2a', barkD: '#55321d', barkHi: '#9c6438', woodL: '#c98b4e', woodM: '#a0663a', woodD: '#6b3d23', woodOut: '#3a2012',
  // sand path
  sandL: '#f2d48a', sandM: '#e3b25a', sandD: '#c98f43', pebL: '#fbe7b5', pebD: '#b98a52', step: '#d8cfb8', stepD: '#9a907c',
  // cottage
  wallL: '#f7e3a3', wallM: '#ecd08a', wallD: '#c79c52', found: '#9a8f7e', foundD: '#6f6658',
  glass: '#8fc7e8', glassHi: '#d8f0ff', frame: '#f4f4f4', shutter: '#3b7a3e', shutterD: '#28562f',
  door: '#8a4b2b', doorD: '#5e321d', knob: '#ffcd75',
  pink: '#f58fc0', red: '#e05a5a', yellow: '#ffd75a', white: '#fff6e8', blue: '#7fb6ff', soil: '#7a4a2a', soilD: '#5a3420', soilL: '#946038',
  ink: '#1a1c2c',
};
const ROOFS = [
  ['#5fae55', '#4a9046', '#336a35', '#1f4426'], // green
  ['#d0645a', '#ad4a48', '#7e3239', '#4e1e26'], // red
  ['#6a8fd6', '#4f70b4', '#384f86', '#222f55'], // blue
];
export const HAIRS = ['#4a2c1a', '#8a5a2b', '#d9773a', '#2b2b33', '#f0c860'];
export const SHIRTS = ['#41a6f6', '#c94d5f', '#ef7d57', '#6fbf4a', '#9a5bd8', '#f0ead8'];
export const PANTS = ['#2f3d73', '#566c86', '#6b3d23'];

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function painter(c) {
  const x = c.getContext('2d');
  return { x, px: (a, b, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); } };
}
// dark outline around every opaque shape (1px), drawn where an empty pixel touches a filled one
function outline(c, col) {
  const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), a = (i, j) => (i < 0 || j < 0 || i >= c.width || j >= c.height ? 0 : d.data[(j * c.width + i) * 4 + 3]);
  const out = [];
  for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) if (!a(i, j) && (a(i - 1, j) || a(i + 1, j) || a(i, j - 1) || a(i, j + 1))) out.push([i, j]);
  x.fillStyle = col; for (const [i, j] of out) x.fillRect(i, j, 1, 1);
  return c;
}
function disc(px, cx, cy, r, col) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) px(cx + i, cy + j, col);
}

// ---------- trees: a leafy canopy built from shaded blobs over a trunk ----------
const CANOPY = [[12, 13, 9], [7, 15, 6], [17, 15, 6], [9, 9, 6], [15, 9, 6], [12, 7, 6], [6, 11, 4], [18, 11, 4]];
function tree(kind, sway) {
  const c = cv(26, 32), { px } = painter(c);
  const P = kind === 'blossom'
    ? [COZY.bloS, COZY.bloD, COZY.bloM, COZY.bloL, COZY.bloHi, COZY.bloOut]
    : [COZY.leafS, COZY.leafD, COZY.leafM, COZY.leafL, COZY.leafHi, COZY.leafOut];
  // trunk with roots
  px(11, 20, COZY.bark, 4, 10); px(14, 20, COZY.barkD, 1, 10); px(11, 20, COZY.barkHi, 1, 8);
  px(9, 28, COZY.bark, 8, 2); px(8, 29, COZY.barkD, 2, 1); px(16, 29, COZY.barkD, 2, 1);
  const off = (j) => (j < 14 ? sway : 0);
  // shadow layer, mid, light, highlights (light from the upper left)
  for (const [cx, cy, r] of CANOPY) disc((a, b, col) => px(a + off(b), b, col), cx, cy + 1, r, P[0]);
  for (const [cx, cy, r] of CANOPY) disc((a, b, col) => px(a + off(b), b, col), cx, cy, r - 1, P[1]);
  for (const [cx, cy, r] of CANOPY) disc((a, b, col) => px(a + off(b), b, col), cx - 1, cy - 1, r - 2, P[2]);
  for (const [cx, cy, r] of CANOPY.slice(3)) disc((a, b, col) => px(a + off(b), b, col), cx - 2, cy - 2, Math.max(1, r - 4), P[3]);
  for (const [a, b] of [[7, 6], [10, 4], [13, 5], [6, 10], [9, 8], [16, 7]]) { px(a + off(b), b, P[4]); }
  if (kind === 'blossom') for (const [a, b] of [[5, 14], [9, 17], [15, 16], [19, 13], [12, 11], [17, 10], [8, 12]]) px(a + off(b), b, COZY.white);
  else for (const [a, b] of [[8, 16], [17, 17], [13, 18]]) px(a + off(b), b, P[1]);
  return outline(c, P[5]);
}

// ---------- cottage: 2x2 tiles, 32x40 ----------
function cottage(roofIdx) {
  const c = cv(32, 40), { px } = painter(c), R = ROOFS[roofIdx];
  // walls with planks
  px(3, 19, COZY.wallM, 26, 18);
  for (let y = 21; y < 37; y += 3) px(3, y, COZY.wallD, 26, 1);
  px(3, 19, COZY.wallL, 26, 1);
  px(2, 19, COZY.woodD, 1, 18); px(29, 19, COZY.woodD, 1, 18); // corner posts
  // stone foundation
  px(1, 36, COZY.found, 30, 4); for (let i = 2; i < 30; i += 5) px(i, 37, COZY.foundD, 1, 2); px(1, 39, COZY.foundD, 30, 1);
  // chimney (behind the roof edge)
  px(22, 1, '#9e4a3a', 4, 8); px(22, 1, '#c86a4a', 4, 1); px(21, 0, COZY.ink, 6, 1);
  // roof: shingle rows widening downwards, eave at the bottom
  for (let r = 0; r < 18; r++) {
    const hw = Math.min(15, 5 + Math.floor(r * 0.75)), y = 3 + r;
    px(16 - hw, y, r % 4 < 2 ? R[0] : R[1], hw * 2, 1);
    for (let i = 16 - hw + ((r >> 1) % 2) * 2; i < 16 + hw; i += 4) px(i, y, R[2]); // shingle joints
  }
  for (let r = 0; r < 18; r++) { const hw = Math.min(15, 5 + Math.floor(r * 0.75)); px(16 - hw - 1, 3 + r, R[3]); px(16 + hw, 3 + r, R[3]); }
  px(11, 2, R[3], 10, 1); px(0, 21, R[3], 32, 1); px(1, 20, R[2], 30, 1); // ridge and eave
  // round attic window
  px(14, 9, COZY.frame, 4, 4); px(15, 10, COZY.glass, 2, 2); px(15, 10, COZY.glassHi);
  // door with frame, step and lamp
  px(12, 25, COZY.woodD, 8, 12); px(13, 26, COZY.door, 6, 11); px(16, 26, COZY.doorD, 1, 11); px(17, 31, COZY.knob);
  px(11, 37, COZY.step, 10, 2); px(11, 38, COZY.stepD, 10, 1);
  // windows with shutters and flower boxes
  for (const wx of [4, 22]) {
    px(wx, 24, COZY.frame, 6, 6); px(wx + 1, 25, COZY.glass, 4, 4); px(wx + 1, 25, COZY.glassHi, 2, 1); px(wx + 3, 25, COZY.frame, 1, 4); px(wx + 1, 27, COZY.frame, 4, 1);
    px(wx - 2, 24, COZY.shutter, 2, 6); px(wx + 6, 24, COZY.shutter, 2, 6); px(wx - 2, 29, COZY.shutterD, 2, 1); px(wx + 6, 29, COZY.shutterD, 2, 1);
    px(wx - 1, 30, COZY.woodM, 8, 2); px(wx - 1, 31, COZY.woodD, 8, 1);
    for (let i = 0; i < 4; i++) px(wx + i * 2, 29, [COZY.pink, COZY.red, COZY.yellow, COZY.pink][i]);
  }
  return outline(c, COZY.ink);
}

// ---------- town hall: 2x2 tiles, a larger timber hall with a red roof, bell and banner ----------
function townHall() {
  const c = cv(32, 42), { px } = painter(c), R = ROOFS[1];
  // stone ground floor, timber upper floor
  px(2, 26, '#b8ad97', 28, 12); for (let y = 28; y < 38; y += 3) px(2, y, '#9a8f7e', 28, 1);
  for (let x = 4; x < 30; x += 6) px(x, 26, '#9a8f7e', 1, 12);
  px(3, 19, COZY.wallL, 26, 7); for (let x = 3; x < 29; x += 5) px(x, 19, COZY.woodD, 1, 7); px(3, 25, COZY.woodD, 26, 1);
  px(1, 38, COZY.found, 30, 4); px(1, 41, COZY.foundD, 30, 1);
  // roof with bell tower
  for (let r = 0; r < 16; r++) {
    const hw = Math.min(16, 6 + Math.floor(r * 0.8)), y = 5 + r;
    px(16 - hw, y, r % 4 < 2 ? R[0] : R[1], hw * 2, 1);
    for (let i = 16 - hw + ((r >> 1) % 2) * 2; i < 16 + hw; i += 4) px(i, y, R[2]);
  }
  px(0, 20, R[3], 32, 1); px(1, 19, R[2], 30, 1);
  px(13, 0, COZY.woodD, 6, 7); px(14, 1, COZY.woodM, 4, 5); px(15, 3, COZY.yellow, 2, 2); px(12, 0, R[3], 8, 1); // bell tower
  // double door, lanterns, windows, banner
  px(11, 29, COZY.woodD, 10, 9); px(12, 30, COZY.door, 4, 8); px(16, 30, COZY.door, 4, 8); px(16, 30, COZY.doorD, 1, 8); px(15, 33, COZY.knob); px(17, 33, COZY.knob);
  px(9, 29, COZY.yellow, 1, 2); px(22, 29, COZY.yellow, 1, 2);
  for (const wx of [4, 23]) { px(wx, 29, COZY.frame, 5, 5); px(wx + 1, 30, COZY.glass, 3, 3); px(wx + 1, 30, COZY.glassHi, 1, 1); px(wx - 1, 34, COZY.woodM, 7, 1); px(wx, 33, COZY.pink, 1, 1); px(wx + 2, 33, COZY.yellow, 1, 1); px(wx + 4, 33, COZY.red, 1, 1); }
  for (const wx of [6, 14, 22]) { px(wx, 21, COZY.frame, 4, 3); px(wx + 1, 22, COZY.glass, 2, 1); }
  px(10, 38, COZY.step, 12, 2); px(10, 39, COZY.stepD, 12, 1);
  px(26, 6, COZY.woodD, 1, 10); px(27, 6, '#d0645a', 4, 3); px(27, 9, '#ad4a48', 3, 1); // banner
  return outline(c, COZY.ink);
}

// ---------- warm stone wall with moss, 16x16 ----------
function stoneWall() {
  const c = cv(16, 16), { px } = painter(c);
  px(0, 4, '#b8ad97', 16, 12);
  const rows = [[5, 0], [8, 3], [11, 0], [14, 3]];
  for (const [y, off] of rows) {
    for (let x = -off; x < 16; x += 6) { px(Math.max(0, x), y, '#d8cfb8', Math.min(5, 16 - Math.max(0, x)), 2); px(Math.max(0, x), y + 2, '#8f8572', Math.min(5, 16 - Math.max(0, x)), 1); }
  }
  px(0, 3, '#6fae46', 16, 2); px(1, 2, '#8fd05a', 5, 1); px(9, 2, '#8fd05a', 4, 1); px(3, 5, '#6fae46', 2, 1); px(12, 5, '#6fae46', 1, 2); // mossy top
  return outline(c, '#3a3328');
}
// ---------- archer tower: warm stone base, wooden lookout, 16x30 ----------
function archerTower() {
  const c = cv(16, 30), { px } = painter(c);
  px(3, 11, '#b8ad97', 10, 18); for (let y = 13; y < 29; y += 4) { px(3, y, '#8f8572', 10, 1); px(5 + ((y >> 2) % 2) * 3, y - 2, '#8f8572', 1, 2); }
  px(3, 11, '#d8cfb8', 1, 18); px(7, 17, COZY.ink, 2, 4); // arrow slit
  px(1, 7, COZY.woodD, 14, 5); px(2, 8, COZY.woodM, 12, 3); px(2, 8, COZY.woodL, 12, 1);
  for (let x = 1; x < 15; x += 4) { px(x, 2, COZY.woodD, 3, 6); px(x + 1, 3, COZY.woodL, 1, 4); }
  px(2, 0, ROOFS[1][1], 12, 3); px(1, 2, ROOFS[1][2], 14, 1); // little red roof
  px(3, 28, '#6fae46', 10, 1);
  return outline(c, COZY.ink);
}

// ---------- fenced crop field: 2x2 tiles ----------
function field() {
  const c = cv(32, 34), { px } = painter(c);
  px(2, 4, COZY.soil, 28, 28);
  for (let y = 6; y < 31; y += 5) {
    px(3, y + 2, COZY.soilD, 26, 1); px(3, y, COZY.soilL, 26, 1);
    for (let x = 4; x < 28; x += 4) {
      px(x + 1, y - 1, COZY.leafM, 1, 2); px(x, y - 2, COZY.leafL, 1, 1); px(x + 2, y - 2, COZY.leafL, 1, 1);
      if ((x + y) % 3 === 0) px(x + 1, y - 2, y % 2 ? COZY.red : '#ff9b3d'); // ripe produce
    }
  }
  // wooden fence around, gate gap at the front
  const post = (x, y) => { px(x, y, COZY.woodM, 2, 5); px(x, y, COZY.woodL, 1, 5); };
  for (let x = 0; x < 32; x += 6) { post(x, 1); if (x < 12 || x > 18) post(x, 28); }
  for (let y = 1; y < 30; y += 6) { post(0, y); post(30, y); }
  px(0, 2, COZY.woodL, 32, 1); px(0, 4, COZY.woodM, 32, 1);
  px(0, 29, COZY.woodL, 12, 1); px(20, 29, COZY.woodL, 12, 1); px(0, 31, COZY.woodM, 12, 1); px(20, 31, COZY.woodM, 12, 1);
  px(0, 2, COZY.woodL, 1, 30); px(31, 2, COZY.woodM, 1, 30);
  return outline(c, COZY.woodOut);
}

// ---------- villagers: 12x19, hair styles and colours vary by "look" ----------
const HEAD = [
  '....kkkk....',
  '...kHHHHk...',
  '..kHHHHHHk..',
  '..kHppppHk..',
  '..kpkppkpk..',
  '..kppppppk..',
  '...kprrpk...',
];
const LONG = ['..kHppppHk..', '..kHkppkHk..', '..kHppppHk..', '...kprrpk...'];
const BODY = [
  '...kSSSSk...',
  '..kSSSSSSk..',
  '.kpSSSSSSpk.',
  '.kpSSSSSSpk.',
  '..kSSSSSSk..',
  '..kBBBBBBk..',
];
const LEGS = {
  a: ['..kBBkkBBk..', '..kBk..kBk..', '..kDk..kDk..', '..kkk..kkk..'],
  b: ['...kBBBBk...', '...kBkkBk...', '...kDkkDk...', '...kkkkkk..'],
  sit: ['.kBBBBBBBBk.', '.kDDk..kDDk.', '.kkkk..kkkk.'],
};
function villager(look, legs) {
  const hair = HAIRS[look % HAIRS.length], shirt = SHIRTS[look % SHIRTS.length], pants = PANTS[look % PANTS.length];
  const head = look % 2 ? [HEAD[0], HEAD[1], HEAD[2], ...LONG] : HEAD;
  const rws = [...head, ...BODY, ...LEGS[legs]];
  const c = cv(12, rws.length), { px } = painter(c);
  const col = { k: COZY.ink, H: hair, p: '#f2c7a0', r: '#d9826b', S: shirt, B: pants, D: '#3a2a20' };
  rws.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (col[row[i]]) px(i, j, col[row[i]]); });
  // eyes are dark pixels in the face row: keep them, they read as eyes at this size
  return c;
}
export const LOOKS = 8;

// ---------- small village decor ----------
function fence() {
  const c = cv(16, 10), { px } = painter(c);
  for (const x of [1, 7, 13]) { px(x, 1, COZY.woodM, 2, 8); px(x, 1, COZY.woodL, 1, 8); }
  px(0, 3, COZY.woodL, 16, 1); px(0, 4, COZY.woodM, 16, 1); px(0, 6, COZY.woodL, 16, 1); px(0, 7, COZY.woodM, 16, 1);
  return outline(c, COZY.woodOut);
}
function flowerbed() {
  const c = cv(16, 8), { px } = painter(c);
  px(1, 4, COZY.soil, 14, 3); px(1, 6, COZY.soilD, 14, 1);
  const cols = [COZY.red, COZY.yellow, COZY.pink, COZY.white, COZY.blue];
  for (let i = 0; i < 6; i++) { const x = 2 + i * 2 + (i % 2); px(x, 3, COZY.leafM, 1, 2); px(x - 1, 1 + (i % 2), cols[i % 5], 3, 2); px(x, 1 + (i % 2), COZY.yellow); }
  return outline(c, COZY.woodOut);
}
function bush() {
  const c = cv(14, 11), { px } = painter(c);
  for (const [cx, cy, r] of [[7, 6, 4], [4, 7, 3], [10, 7, 3]]) disc(px, cx, cy, r, COZY.leafD);
  for (const [cx, cy, r] of [[7, 5, 3], [4, 6, 2], [10, 6, 2]]) disc(px, cx - 1, cy - 1, r - 1, COZY.leafM);
  px(5, 3, COZY.leafHi); px(8, 3, COZY.leafL); px(3, 5, COZY.leafL);
  return outline(c, COZY.leafOut);
}

// Sprites that replace the older, plainer ones in the atlas (same frame names, so every
// system that uses them keeps working).
export function cozySprites() {
  const out = {};
  for (const [kind, name] of [['round', 'tree'], ['blossom', 'blossom']]) {
    out[name] = tree(kind, 0); out[name + '_a'] = tree(kind, -1); out[name + '_b'] = tree(kind, 1);
  }
  ROOFS.forEach((_, i) => { out[`house_${i}`] = cottage(i); });
  out.house = out.house_0;
  out.hall = townHall();
  out.wall = stoneWall();
  out.tower = archerTower();
  out.farm = field();
  for (let look = 0; look < LOOKS; look++) {
    out[`vill${look}_0`] = villager(look, 'a');
    out[`vill${look}_1`] = villager(look, 'b');
    out[`vill${look}_sit`] = villager(look, 'sit');
  }
  out.fence = fence();
  out.flowerbed = flowerbed();
  out.shrub = bush();
  return out;
}
export const cozyIcon = (name) => {
  if (name === 'house') return cottage(0);
  if (name === 'farm') return field();
  if (name === 'wall') return stoneWall();
  if (name === 'tower') return archerTower();
  const m = /^vill(\d)$/.exec(name);
  return m ? villager(+m[1], 'a') : null;
};
