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
const TREE_PAL = {
  round: [COZY.leafS, COZY.leafD, COZY.leafM, COZY.leafL, COZY.leafHi, COZY.leafOut],
  fruit: [COZY.leafS, COZY.leafD, COZY.leafM, COZY.leafL, COZY.leafHi, COZY.leafOut],
  blossom: [COZY.bloS, COZY.bloD, COZY.bloM, COZY.bloL, COZY.bloHi, COZY.bloOut],
  autumn: ['#8a3b1e', '#b8562a', '#e07a34', '#f2a845', '#ffd27a', '#4a1e12'],
  golden: ['#7a6a1e', '#a8902a', '#d4b83a', '#ecd65a', '#fff09a', '#3f3510'],
  deep: ['#163f27', '#235a33', '#2f7a3c', '#4a9a48', '#78c060', '#0f2a1b'],
};
// Trees with a real structure: a tapering trunk that forks into branches, leaf clusters at the
// branch tips with gaps between them (so branches show), ragged edges and a speckled leaf texture
// lit from the upper left. Texture is seeded per tree shape so sway frames match.
function hash(i, j, k) { let h = Math.imul(i * 73856093 ^ j * 19349663 ^ k * 83492791, 2654435761); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
function line(px, x0, y0, x1, y1, w, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let t = 0; t <= n; t++) { const x = Math.round(x0 + ((x1 - x0) * t) / n), y = Math.round(y0 + ((y1 - y0) * t) / n); px(x, y, col, w, w); }
}
const SHAPES = {
  // trunk top, branch tips (x, y, cluster radius)
  big: { W: 32, H: 40, base: 16, top: 22, tips: [[8, 15, 6], [24, 14, 6], [16, 9, 7], [11, 6, 4], [21, 6, 4], [5, 21, 3], [27, 20, 3]] },
  small: { W: 22, H: 28, base: 11, top: 16, tips: [[5, 11, 4], [17, 10, 4], [11, 6, 5], [8, 4, 3]] },
};
function tree(kind, sway, size = 'big') {
  const S = SHAPES[size], c = cv(S.W, S.H), { px } = painter(c);
  const P = TREE_PAL[kind] || TREE_PAL.round;
  const off = (y) => (y < S.top - 2 ? sway : 0);
  // trunk: tapering, bark lines, root flare
  for (let y = S.top; y < S.H - 1; y++) {
    const wdt = y > S.H - 4 ? 6 : y > S.top + 6 ? 4 : 3, x0 = S.base - (wdt >> 1);
    px(x0, y, COZY.bark, wdt, 1); px(x0 + wdt - 1, y, COZY.barkD); if (y % 3 === 0) px(x0 + 1, y, COZY.barkD); px(x0, y, COZY.barkHi);
  }
  px(S.base - 4, S.H - 2, COZY.barkD, 2, 1); px(S.base + 3, S.H - 2, COZY.barkD, 2, 1);
  // branches from the trunk top to every tip (thick then thin), drawn under the leaves
  for (const [tx, ty] of S.tips) {
    const mx = Math.round((S.base + tx) / 2), my = Math.round((S.top + ty) / 2) + 1;
    line(px, S.base, S.top, mx + off(my), my, 2, COZY.bark);
    line(px, mx + off(my), my, tx + off(ty), ty, 1, COZY.barkD);
  }
  // leaf clusters: ragged discs, shaded by light direction, speckled
  const leaf = (x, y, col) => px(x + off(y), y, col);
  S.tips.forEach(([cx, cy, r], n) => {
    for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) {
      const d = Math.hypot(i, j * 1.1), edge = r + (hash(cx + i, cy + j, n) - 0.5) * 2.2;
      if (d > edge) continue;
      const light = (-i - j) / (r * 1.6) + (hash(i, j, n + 7) - 0.5) * 0.9; // upper left is lit
      const k = light > 0.75 ? 4 : light > 0.3 ? 3 : light > -0.2 ? 2 : light > -0.6 ? 1 : 0;
      leaf(cx + i, cy + j, P[k]);
    }
  });
  // small gaps of sky between leaves so the crown is not a solid lump
  S.tips.forEach(([cx, cy, r], n) => { for (let k = 0; k < r; k++) { const a = hash(cx, cy, k + n) * 6.28, rr = r * 0.55; const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr); if (hash(x, y, 99) < 0.35) { c.getContext('2d').clearRect(x + off(y), y, 1, 1); } } });
  if (kind === 'blossom') S.tips.forEach(([cx, cy], n) => { for (let k = 0; k < 3; k++) px(cx - 2 + ((hash(cx, k, n) * 5) | 0) + off(cy), cy - 2 + ((hash(cy, k, n) * 5) | 0), COZY.white); });
  if (kind === 'fruit') S.tips.slice(0, 5).forEach(([cx, cy], n) => { const x = cx - 2 + ((hash(cx, n, 3) * 4) | 0), y = cy + 1 + ((hash(cy, n, 4) * 2) | 0); px(x + off(y), y, '#e0403a', 2, 2); px(x + off(y), y, '#ff8a7a'); });
  return outline(c, P[5]);
}
function smallTree(sway) { return tree('round', sway, 'small'); }

// ---------- cottage: 2x2 tiles, 32x40 ----------
const WALLS = [[COZY.wallL, COZY.wallM, COZY.wallD], ['#ffd9d0', '#f2b9ad', '#c98a7e'], ['#dcecf7', '#bcd5ea', '#8eaecb']];
function cottage(roofIdx, wallIdx = 0) {
  const c = cv(32, 40), { px } = painter(c), R = ROOFS[roofIdx], Wl = WALLS[wallIdx];
  // walls with planks
  px(3, 19, Wl[1], 26, 18);
  for (let y = 21; y < 37; y += 3) px(3, y, Wl[2], 26, 1);
  px(3, 19, Wl[0], 26, 1);
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

// ---------- log cabin: 2x2, steep roof, round log walls ----------
function cabin(roofIdx) {
  const c = cv(32, 40), { px } = painter(c), R = ROOFS[roofIdx];
  for (let y = 18; y < 37; y += 3) { px(3, y, COZY.woodM, 26, 3); px(3, y, COZY.woodL, 26, 1); px(3, y + 2, COZY.woodD, 26, 1); px(2, y, COZY.woodL, 2, 3); px(28, y, COZY.woodL, 2, 3); px(2, y + 1, COZY.woodD, 1, 1); px(29, y + 1, COZY.woodD, 1, 1); }
  px(1, 36, COZY.found, 30, 4); px(1, 39, COZY.foundD, 30, 1);
  px(5, 1, '#8f8572', 4, 9); px(5, 1, '#b8ad97', 4, 1); // stone chimney on the left
  for (let r = 0; r < 18; r++) { const hw = Math.min(16, 1 + r), y = 2 + r; px(16 - hw, y, r % 3 ? R[0] : R[1], hw * 2, 1); px(16 - hw, y, R[3]); px(16 + hw - 1, y, R[3]); }
  px(0, 19, R[3], 32, 1);
  px(13, 9, COZY.woodD, 6, 6); px(14, 10, COZY.glass, 4, 4); px(16, 10, COZY.woodD, 1, 4); // loft window
  px(12, 25, COZY.woodOut, 8, 12); px(13, 26, COZY.woodD, 6, 11); px(16, 26, COZY.woodOut, 1, 11); px(17, 31, COZY.knob);
  for (const wx of [5, 22]) { px(wx, 24, COZY.woodOut, 6, 6); px(wx + 1, 25, '#ffd98a', 4, 4); px(wx + 3, 25, COZY.woodOut, 1, 4); }
  px(11, 37, COZY.step, 10, 2);
  px(23, 31, COZY.woodD, 5, 5); px(24, 30, '#c98b4e', 3, 1); // log pile by the wall
  return outline(c, COZY.ink);
}
// ---------- two-storey townhouse: 2x2, tall and narrow with a balcony ----------
function townhouse(roofIdx, wallIdx) {
  const c = cv(32, 44), { px } = painter(c), R = ROOFS[roofIdx], Wl = WALLS[wallIdx];
  px(5, 14, Wl[1], 22, 27); for (let y = 16; y < 41; y += 4) px(5, y, Wl[2], 22, 1); px(5, 14, Wl[0], 22, 1);
  px(4, 14, COZY.woodD, 1, 27); px(27, 14, COZY.woodD, 1, 27);
  px(3, 40, COZY.found, 26, 4); px(3, 43, COZY.foundD, 26, 1);
  for (let r = 0; r < 13; r++) { const hw = Math.min(13, 3 + r), y = 2 + r; px(16 - hw, y, r % 4 < 2 ? R[0] : R[1], hw * 2, 1); px(16 - hw - 1, y, R[3]); px(16 + hw, y, R[3]); }
  px(2, 14, R[3], 28, 1); px(19, 0, '#9e4a3a', 3, 6);
  // upper floor windows + balcony
  for (const wx of [7, 19]) { px(wx, 17, COZY.frame, 6, 6); px(wx + 1, 18, COZY.glass, 4, 4); px(wx + 1, 18, COZY.glassHi, 2, 1); px(wx + 3, 18, COZY.frame, 1, 4); }
  px(5, 24, COZY.woodD, 22, 1); for (let x = 6; x < 27; x += 3) px(x, 25, COZY.woodM, 1, 3); px(5, 27, COZY.woodD, 22, 1);
  for (let x = 7; x < 26; x += 4) px(x, 23, [COZY.pink, COZY.red, COZY.yellow][x % 3], 2, 1);
  // ground floor
  px(13, 31, COZY.woodD, 7, 10); px(14, 32, COZY.door, 5, 9); px(18, 36, COZY.knob);
  for (const wx of [6, 22]) { px(wx, 31, COZY.frame, 5, 6); px(wx + 1, 32, COZY.glass, 3, 4); px(wx - 1, 37, COZY.woodM, 7, 1); }
  px(12, 41, COZY.step, 9, 2);
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
const CROPS = [
  { leaf: COZY.leafM, hi: COZY.leafL, fruit: ['#e0403a', '#ff9b3d'] },       // tomatoes and carrots
  { leaf: '#c9a43a', hi: '#f2d06a', fruit: ['#f2d06a', '#e8c050'] },          // wheat
  { leaf: '#5aa860', hi: '#8fd08a', fruit: ['#9a5bd8', '#f0a030'] },          // cabbages and pumpkins
];
function field(crop = 0) {
  const c = cv(32, 34), { px } = painter(c), C = CROPS[crop];
  px(2, 4, COZY.soil, 28, 28);
  for (let y = 6; y < 31; y += 5) {
    px(3, y + 2, COZY.soilD, 26, 1); px(3, y, COZY.soilL, 26, 1);
    for (let x = 4; x < 28; x += 4) {
      px(x + 1, y - 1, C.leaf, 1, 2); px(x, y - 2, C.hi, 1, 1); px(x + 2, y - 2, C.hi, 1, 1);
      if (crop === 1) px(x + 1, y - 3, C.hi, 1, 1); // wheat ears
      if ((x + y) % 3 === 0) px(x + 1, y - 2, C.fruit[y % 2], crop === 2 ? 2 : 1, crop === 2 ? 2 : 1); // ripe produce
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
const SKINS = ['#f2c7a0', '#d9a173', '#a8724a'];
const BUN = ['....kk......', '...kHHk.....', '...kHHk.....', '..kkkkkk....'];
const HAT = ['...kkkkkk...', '..kTTTTTTk..', '.kTTTTTTTTk.'];
const HATS = ['#c9a43a', '#b13e53', '#3b5dc9', '#6b3d23'];
function villager(look, legs) {
  // look -> skin, hair colour, hair style, shirt and trousers, so 24 looks rarely repeat side by side
  const hair = HAIRS[look % HAIRS.length], shirt = SHIRTS[(look * 5) % SHIRTS.length], pants = PANTS[(look >> 1) % PANTS.length];
  const skin = SKINS[(look >> 2) % SKINS.length], style = (look * 7) % 4;
  let head = HEAD;
  if (style === 1) head = [HEAD[0], HEAD[1], HEAD[2], ...LONG];
  if (style === 2) head = [...BUN.slice(0, 3), ...HEAD.slice(1)];
  if (style === 3) head = [...HAT, ...HEAD.slice(3)];
  const rws = [...head, ...BODY, ...LEGS[legs]];
  const c = cv(12, rws.length), { px } = painter(c);
  const col = { k: COZY.ink, H: hair, p: skin, r: '#c9705a', S: shirt, B: pants, D: '#3a2a20', T: HATS[look % HATS.length] };
  rws.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (col[row[i]]) px(i, j, col[row[i]]); });
  // eyes are dark pixels in the face row: keep them, they read as eyes at this size
  return c;
}
export const LOOKS = 24;

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

// ---------- village props ----------
const PROPS = {
  barrel: ['..kkkkk..', '.kNnunNk.', 'kSSSSSSSk', 'kNnnunnNk', 'kNnnunnNk', 'kSSSSSSSk', 'kNnnunnNk', '.kNnunNk.', '..kkkkk..'],
  crate: ['kkkkkkk', 'knNnNnk', 'kNknkNk', 'knNkNnk', 'kNknkNk', 'knNnNnk', 'kkkkkkk'],
  logs: ['...kkkk...', '..kunnuk..', 'kkkunnukkk', 'kunnukunnk', 'kunnukunnk', '.kkkk.kkkk'],
  stump: ['.kkkkk.', 'kuuNuuk', 'kNuuuNk', 'knnnnnk', 'kNnnnNk', 'kkkkkkk'],
  mailbox: ['.kkkk.', 'kbbbbk', 'kbwwbk', 'kbbbbk', '.kkkk.', '..kn..', '..kn..', '..kn..', '.kkkk.'],
  hay: ['...kkkkk...', '..kyyyyyk..', '.kyuyyyuyk.', 'kyyyuyyyyuk', 'kuyyyyuyyyk', '.kkkkkkkkk.'],
  sign: ['kkkkkkkk', 'knnnnnnk', 'kNkNNkNk', 'knnnnnnk', 'kkkknkkk', '...kn...', '...kn...', '..kkkk..'],
  rock_1: ['....kkkk....', '..kkssswkk..', '.ksswwsssSk.', 'kSssssssSSSk', 'kDSSssSSSSDk', '.kkDDDDDDkk.'],
  rock_2: ['..kkk.kkk...', '.ksswkswsk..', 'kssSskssSk..', 'kSSSDkSSSDk.', '.kkkkkkkkk..'],
  mushroom_b: ['.kkk.', 'kNuNk', 'kNNNk', '.kwk.', '.kkk.'],
};
const PROP_COL = { k: COZY.ink, n: COZY.woodM, N: COZY.woodD, u: COZY.woodL, b: '#3b5dc9', w: COZY.white, y: '#f2d06a', s: '#c9c0aa', S: '#9a9080', D: '#6f6658' };
function prop(rows) { const c = cv(Math.max(...rows.map((r) => r.length)), rows.length), { px } = painter(c); rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (PROP_COL[r[i]]) px(i, j, PROP_COL[r[i]]); }); return c; }
function well() {
  const c = cv(18, 22), { px } = painter(c);
  px(2, 13, '#b8ad97', 14, 8); for (let x = 2; x < 16; x += 4) px(x, 14, '#d8cfb8', 3, 2); px(2, 17, '#9a9080', 14, 1); px(3, 12, '#3b5dc9', 12, 2);
  px(2, 3, COZY.woodD, 2, 11); px(14, 3, COZY.woodD, 2, 11); px(1, 1, ROOFS[1][1], 16, 3); px(0, 3, ROOFS[1][3], 18, 1);
  px(8, 4, COZY.woodL, 2, 5); px(7, 9, COZY.woodM, 4, 3);
  return outline(c, COZY.ink);
}

// Sprites that replace the older, plainer ones in the atlas (same frame names, so every
// system that uses them keeps working).
export function cozySprites() {
  const out = {};
  for (const [kind, name] of [['round', 'tree'], ['blossom', 'blossom']]) {
    out[name] = tree(kind, 0); out[name + '_a'] = tree(kind, -1); out[name + '_b'] = tree(kind, 1);
  }
  // nine house looks: three shapes, each with its own roof colour and wall colour
  const HOUSES = [() => cottage(0, 0), () => cabin(1), () => townhouse(2, 1), () => cottage(1, 2), () => cabin(0), () => townhouse(0, 0), () => cottage(2, 1), () => cabin(2), () => townhouse(1, 2)];
  HOUSES.forEach((f, i) => { out[`house_${i}`] = f(); });
  out.house = out.house_0;
  for (const kind of ['fruit', 'autumn', 'golden', 'deep']) { out[kind] = tree(kind, 0); out[kind + '_a'] = tree(kind, -1); out[kind + '_b'] = tree(kind, 1); }
  out.small = smallTree(0); out.small_a = smallTree(-1); out.small_b = smallTree(1);
  CROPS.forEach((_, i) => { out[`farm_${i}`] = field(i); });
  for (const k in PROPS) out[k] = prop(PROPS[k]); // props carry their own outline
  out.well = well();
  out.hall = townHall();
  out.wall = stoneWall();
  out.tower = archerTower();
  out.farm = out.farm_0;
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
