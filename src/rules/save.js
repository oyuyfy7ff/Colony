// Save file handling (save-systems skill): plain JSON data, an integer version with step-by-step
// migrations, a .bak of the previous good save, defensive loading. Storage is injected so the
// same code runs on localStorage in the game and on a Map in tests.
import { MAP_W, MAP_H, NAMES } from './config.js';
import { rebuild, previewNight, assignHomes } from './world.js';

export const SAVE_VERSION = 6;
export const SAVE_KEY = 'pixel-colony-save';

// v -> v+1, pure functions. Keep every one forever: deleting one strands that version's saves.
export const MIGRATIONS = {
  1: (d) => {
    // v2 added breakfast (fed), the telegraphed next raid and per-enemy pathing fields
    d.fed = d.fed ?? true;
    d.nextWave = null;
    d.nextSide = d.nextSide ?? 0;
    for (const e of d.enemies || []) Object.assign(e, { path: [], prog: 999, best: 999, stuckT: 0 });
    for (const s of d.spawnQueue || []) s.hpMul = s.hpMul ?? 1;
    return d;
  },
  2: (d) => {
    // v3 added village life: names, homes, worn paths, roads and growing trees
    d.wear = new Array(MAP_W * MAP_H).fill(0);
    d.road = new Array(MAP_W * MAP_H).fill(0);
    (d.villagers || []).forEach((v, i) => Object.assign(v, { name: v.name || NAMES[i % NAMES.length], home: 0, emote: null, sit: false, pause: 0 }));
    for (const k in d.nodes || {}) d.nodes[k].grow = d.nodes[k].grow ?? 2;
    return d;
  },
  3: (d) => {
    // v4: houses and farms grew to 2x2 tiles; trees got a saved look.
    // A building whose new footprint hits water or another building is refunded and removed;
    // resource nodes under a new footprint are cleared.
    const W = MAP_W, inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < MAP_H;
    const big = new Set(['house', 'farm']), size = (b) => (big.has(b.type) || b.type === 'hall' ? 2 : 1);
    const keep = [];
    const taken = new Map();
    const order = [...(d.buildings || [])].sort((a, b) => (a.type === 'hall' ? -1 : b.type === 'hall' ? 1 : 0));
    for (const b of order) {
      const n = size(b), tiles = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) tiles.push([b.x + x, b.y + y]);
      const ok = tiles.every(([x, y]) => inMap(x, y) && d.terrain[y * W + x] !== 1 && !taken.has(y * W + x));
      if (!ok) { d.stock.wood += b.type === 'house' ? 20 : b.type === 'farm' ? 15 : 0; continue; }
      for (const [x, y] of tiles) { taken.set(y * W + x, b.id); delete d.nodes[y * W + x]; if (d.road) d.road[y * W + x] = 0; }
      if (big.has(b.type)) b.hp = Math.min(b.hp * 1.5, b.type === 'house' ? 120 : 70);
      keep.push(b);
    }
    d.buildings = keep;
    const r = () => Math.random();
    for (const k in d.nodes || {}) if (d.nodes[k].t === 'tree' && !d.nodes[k].style) { const x = r(); d.nodes[k].style = x < 0.25 ? 'pine' : x < 0.37 ? 'blossom' : 'round'; delete d.nodes[k].pine; }
    for (const v of d.villagers || []) if (v.hidden && !keep.some((b) => b.id === v.home)) v.home = 0;
    return d;
  },
  4: (d) => {
    // v5: the player walks the map, and villagers take orders
    const h = (d.buildings || []).find((b) => b.type === 'hall');
    d.player = d.player || { x: (h ? h.x + 1 : MAP_W / 2) + 0.5, y: (h ? h.y + 3 : MAP_H / 2) + 0.5, face: 1, cd: 0, moving: false };
    for (const v of d.villagers || []) v.order = v.order || (d.focus && d.focus !== 'auto' ? d.focus : 'auto');
    return d;
  },
  5: (d) => {
    // v6: smaller trees, rocks and bushes (they fall after a few hits), a resource ledger, a tree cap
    const MAX = { tree: 6, rock: 8, bush: 4 };
    for (const k in d.nodes || {}) { const n = d.nodes[k]; if (MAX[n.t]) n.amt = Math.min(n.amt, MAX[n.t]); }
    d.treeCap = Math.max(120, Object.values(d.nodes || {}).filter((n) => n.t === 'tree').length);
    d.ledger = { start: { ...d.stock }, mined: { wood: 0, stone: 0, food: 0 }, farmed: 0, refunded: { wood: 0, stone: 0, food: 0 }, spent: { wood: 0, stone: 0, food: 0 }, eaten: 0 };
    for (const v of d.villagers || []) if (v.carry) d.ledger.start[v.carry.res] += v.carry.amt; // goods in hand count as already owned
    if (d.player) d.player.lock = null;
    return d;
  },
};

export function serializeWorld(w) {
  const { _flowDirty, events, ...rest } = w;
  return JSON.stringify({ ...rest, v: SAVE_VERSION, events: [] });
}

export function validate(d) {
  const ok = d && Array.isArray(d.terrain) && d.terrain.length === MAP_W * MAP_H
    && Array.isArray(d.buildings) && d.buildings.some((b) => b.type === 'hall')
    && Array.isArray(d.villagers) && d.stock && ['wood', 'stone', 'food'].every((k) => Number.isFinite(d.stock[k]))
    && Number.isInteger(d.day) && d.day >= 1
    && Array.isArray(d.wear) && d.wear.length === MAP_W * MAP_H && Array.isArray(d.road) && d.road.length === MAP_W * MAP_H;
  if (!ok) throw new Error('invalid save');
}

// Returns { w } or { error: 'none' | 'newer' | 'corrupt' }.
export function parseSave(json) {
  let d;
  try { d = JSON.parse(json); } catch { return { error: 'corrupt' }; }
  if (!d || typeof d !== 'object') return { error: 'corrupt' };
  let v = Number.isInteger(d.v) ? d.v : 1;
  if (v > SAVE_VERSION) return { error: 'newer', version: v };
  try {
    while (v < SAVE_VERSION) { d = MIGRATIONS[v](d); v++; d.v = v; }
    validate(d);
  } catch { return { error: 'corrupt' }; }
  d.events = [];
  rebuild(d);
  assignHomes(d);
  if (!d.nextWave || d.nextWave.day !== d.day) previewNight(d);
  return { w: d };
}

export function loadFrom(storage, key = SAVE_KEY) {
  let first = null;
  for (const [k, from] of [[key, 'primary'], [key + '.bak', 'backup']]) {
    let json = null;
    try { json = storage.getItem(k); } catch { /* storage blocked */ }
    if (json == null) continue;
    const r = parseSave(json);
    if (r.w) return { w: r.w, from, problem: first };
    if (r.error === 'newer') return r; // never half-load or overwrite a newer build's save
    first = first || r.error;
  }
  return { error: first || 'none' };
}

// Write the new save under a temp key, keep the last good save as .bak, then swap it in.
export function writeTo(storage, w, key = SAVE_KEY) {
  const json = serializeWorld(w);
  try {
    storage.setItem(key + '.tmp', json);
    const prev = storage.getItem(key);
    if (prev != null && !parseSave(prev).error) storage.setItem(key + '.bak', prev);
    storage.setItem(key, json);
    storage.removeItem(key + '.tmp');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'full' : 'blocked' };
  }
}

export function clearFrom(storage, key = SAVE_KEY) {
  for (const k of [key, key + '.bak', key + '.tmp']) { try { storage.removeItem(k); } catch { /* ignore */ } }
}
