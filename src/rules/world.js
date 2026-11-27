// Pure game rules: no Phaser import. The scene reads `w` and calls the exported commands.
import {
  MAP_W, MAP_H, DAY_LEN, NIGHT_LEN, WARN_TIME, T_GRASS, T_WATER, NODES, CARRY,
  VILLAGER_SPEED, VILLAGER_HP, BUILDINGS, ENEMIES, GROW_EVERY, GROW_FOOD, FED_BONUS,
} from './config.js';
import { bfs, flowField, downhill } from './path.js';
import { planNight } from './waves.js';
import { parseSave } from './save.js';

const CYCLE = DAY_LEN + NIGHT_LEN;

// ---------- random ----------
export function rand(w) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (w, n) => Math.floor(rand(w) * n);

function valueNoise(seed, scale) {
  const g = [];
  const gw = Math.ceil(MAP_W / scale) + 2, gh = Math.ceil(MAP_H / scale) + 2;
  const tmp = { rng: seed };
  for (let i = 0; i < gw * gh; i++) g.push(rand(tmp));
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale, fy = y / scale;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = s(fx - ix), ty = s(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
    const c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// ---------- creation ----------
export function createWorld(seed = (Math.random() * 1e9) | 0) {
  const w = {
    v: 2, seed, rng: seed, time: 0, clock: 8, day: 1, night: false, warned: false,
    stock: { wood: 30, stone: 10, food: 20 }, focus: 'auto',
    terrain: new Array(MAP_W * MAP_H).fill(T_GRASS), nodes: {},
    buildings: [], villagers: [], enemies: [], shots: [], spawnQueue: [],
    nextId: 1, growT: 0, sproutT: 0, over: false,
    stats: { kills: 0, born: 0 }, events: [],
    fed: true, nextWave: null, nextSide: 0,
  };
  const cx = (MAP_W / 2) | 0, cy = (MAP_H / 2) | 0;
  const water = valueNoise(seed ^ 0x1234, 7);
  const forest = valueNoise(seed ^ 0x9876, 5);
  const stone = valueNoise(seed ^ 0x5555, 4);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const d = Math.hypot(x - cx, y - cy);
      if (d < 7) continue;
      if (water(x, y) > 0.72) { w.terrain[i] = T_WATER; continue; }
      if (d < 5) continue;
      const r = rand(w);
      if (forest(x, y) > 0.58 && r < 0.55) w.nodes[i] = { t: 'tree', amt: NODES.tree.amt };
      else if (stone(x, y) > 0.68 && r < 0.45) w.nodes[i] = { t: 'rock', amt: NODES.rock.amt };
      else if (r < 0.025) w.nodes[i] = { t: 'bush', amt: NODES.bush.amt, regrow: 0 };
      else if (r < 0.05) w.nodes[i] = { t: 'tree', amt: NODES.tree.amt };
    }
  }
  // guarantee a few of each resource near the start
  const near = [['tree', 6], ['rock', 3], ['bush', 3]];
  for (const [t, n] of near) {
    for (let k = 0, tries = 0; k < n && tries < 500; tries++) {
      const a = rand(w) * Math.PI * 2, r = 5 + rand(w) * 4;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const i = y * MAP_W + x;
      if (w.terrain[i] === T_GRASS && !w.nodes[i]) { w.nodes[i] = { t, amt: NODES[t].amt, regrow: 0 }; k++; }
    }
  }
  addBuilding(w, 'hall', cx - 1, cy - 1, true);
  for (let k = 0; k < 3; k++) spawnVillager(w);
  rebuild(w);
  previewNight(w);
  return w;
}

// Derived lookup tables (not saved).
export function rebuild(w) {
  const b = new Int32Array(MAP_W * MAP_H);
  for (const bd of w.buildings) {
    const def = BUILDINGS[bd.type];
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) b[(bd.y + y) * MAP_W + bd.x + x] = bd.id;
  }
  Object.defineProperty(w, '_b', { value: b, enumerable: false, configurable: true, writable: true });
  w._flowDirty = true;
}
// Derived, not saved: the enemies' shared flow field toward any building.
function flow(w) {
  if (!w._flow || w._flowDirty) {
    const f = flowField((x, y) => walkable(w, x, y), (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inMap(x + dx, y + dy) && w._b[idx(x + dx, y + dy)]) return true;
      return false;
    });
    Object.defineProperty(w, '_flow', { value: f, enumerable: false, configurable: true, writable: true });
    w._flowDirty = false;
    for (const e of w.enemies) { e.best = 999; e.stuckT = 0; } // distances changed: restart the stuck guard
  }
  return w._flow;
}

export const hall = (w) => w.buildings.find((b) => b.type === 'hall');
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const idx = (x, y) => y * MAP_W + x;
export function walkable(w, x, y) {
  if (!inMap(x, y)) return false;
  const i = idx(x, y);
  return w.terrain[i] !== T_WATER && !w.nodes[i] && !w._b[i];
}
export const buildingAt = (w, x, y) => (inMap(x, y) ? w.buildings.find((b) => b.id === w._b[idx(x, y)]) : undefined);
const nextTo = (x, y, rx, ry, rw, rh) => x >= rx - 1 && x <= rx + rw && y >= ry - 1 && y <= ry + rh && !(x >= rx && x < rx + rw && y >= ry && y < ry + rh);

function addBuilding(w, type, x, y, done) {
  const def = BUILDINGS[type];
  const b = { id: w.nextId++, type, x, y, hp: done ? def.hp : Math.ceil(def.hp * 0.25), done, progress: done ? def.build : 0, cd: 0, prod: 0 };
  w.buildings.push(b);
  return b;
}

function spawnVillager(w) {
  const h = hall(w);
  const hx = h ? h.x + 1 : MAP_W / 2, hy = h ? h.y + 2 : MAP_H / 2;
  const v = { id: w.nextId++, x: hx + 0.5, y: hy + 0.5, hp: VILLAGER_HP, path: [], job: null, carry: null, work: 0, wait: rand(w), hidden: false, look: randInt(w, 4), face: 1 };
  w.villagers.push(v);
  return v;
}

// ---------- commands (called by UI) ----------
export function popCap(w) {
  return w.buildings.reduce((s, b) => s + (b.done ? BUILDINGS[b.type].pop || 0 : 0), 0);
}
export function canAfford(w, type) {
  const c = BUILDINGS[type].cost;
  return Object.keys(c).every((k) => w.stock[k] >= c[k]);
}
export function canPlace(w, type, x, y) {
  const def = BUILDINGS[type];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (!walkable(w, x + dx, y + dy)) return false;
  return true;
}
export function placeBuilding(w, type, x, y) {
  if (w.over) return { ok: false, why: 'over' };
  if (!canPlace(w, type, x, y)) return { ok: false, why: 'blocked' };
  if (!canAfford(w, type)) return { ok: false, why: 'cost' };
  const c = BUILDINGS[type].cost;
  for (const k in c) w.stock[k] -= c[k];
  const b = addBuilding(w, type, x, y, false);
  rebuild(w);
  // anyone standing on the new tile steps off
  for (const v of w.villagers) if (w._b[idx(v.x | 0, v.y | 0)] === b.id) resetJob(v);
  return { ok: true, b };
}
export function demolish(w, id) {
  const b = w.buildings.find((x) => x.id === id);
  if (!b || b.type === 'hall') return false;
  const c = BUILDINGS[b.type].cost;
  for (const k in c) w.stock[k] += Math.floor(c[k] / 2);
  removeBuilding(w, b);
  return true;
}
function removeBuilding(w, b) {
  w.buildings = w.buildings.filter((x) => x !== b);
  rebuild(w);
  for (const e of w.enemies) if (e.target === b.id) { e.target = 0; e.path = []; }
  for (const v of w.villagers) if (v.job && v.job.b === b.id) resetJob(v);
}

// ---------- simulation ----------
export function tick(w, dt) {
  if (w.over) return;
  w.time += dt;
  w.clock += dt;
  if (!w.night && !w.warned && w.clock >= DAY_LEN - WARN_TIME) {
    w.warned = true;
    w.events.push({ type: 'warn' });
    for (const v of w.villagers) if (!v.hidden) resetJob(v);
  }
  if (!w.night && w.clock >= DAY_LEN) startNight(w);
  if (w.night && w.clock >= CYCLE) startDay(w);

  economy(w, dt);
  for (const v of w.villagers) stepVillager(w, v, dt);
  spawnEnemies(w, dt);
  for (const e of w.enemies) stepEnemy(w, e, dt);
  defenses(w, dt);
  stepShots(w, dt);
  w.enemies = w.enemies.filter((e) => {
    if (e.hp > 0) return true;
    if (e.gaveUp) { w.events.push({ type: 'flee', x: e.x, y: e.y, kind: e.kind }); return false; }
    w.stats.kills++;
    w.events.push({ type: 'die', x: e.x, y: e.y, kind: e.kind });
    return false;
  });
  for (const b of [...w.buildings]) if (b.hp <= 0) {
    w.events.push({ type: 'destroyed', x: b.x + BUILDINGS[b.type].w / 2, y: b.y + BUILDINGS[b.type].h / 2, btype: b.type });
    if (b.type === 'hall') { w.over = true; w.events.push({ type: 'over' }); return; }
    removeBuilding(w, b);
  }
}

export const isDusk = (w) => !w.night && w.clock >= DAY_LEN - WARN_TIME;
export const phase = (w) => (w.night ? (w.clock - DAY_LEN) / NIGHT_LEN : w.clock / DAY_LEN);

export function previewNight(w) {
  w.nextWave = planNight(w.day, w.buildings.length);
  w.nextSide = randInt(w, 4); // most enemies come from one side: readable, and walls there pay off
}
function startNight(w) {
  w.night = true;
  if (!w.nextWave || w.nextWave.day !== w.day) previewNight(w);
  const plan = w.nextWave, side = w.nextSide;
  w.spawnQueue = [];
  for (const g of plan.groups) for (let k = 0; k < g.count; k++) {
    w.spawnQueue.push({ at: 1 + rand(w) * (NIGHT_LEN * 0.3), kind: g.kind, hpMul: plan.hpMul, side: rand(w) < 0.75 ? side : randInt(w, 4) });
  }
  w.spawnQueue.sort((a, b) => a.at - b.at);
  w.events.push({ type: 'night', plan, side });
}
function startDay(w) {
  w.night = false; w.warned = false; w.clock = 0; w.day++;
  for (const e of w.enemies) w.events.push({ type: 'flee', x: e.x, y: e.y, kind: e.kind });
  w.enemies = []; w.shots = []; w.spawnQueue = [];
  const h = hall(w);
  for (const v of w.villagers) {
    if (v.hidden) { v.hidden = false; v.x = h.x + 0.5 + randInt(w, 2); v.y = h.y + 2.5; }
    resetJob(v);
  }
  // breakfast: one food each. Fed villagers work faster today; hungry ones are just slower.
  const need = w.villagers.length;
  w.fed = w.stock.food >= need;
  if (w.fed) w.stock.food -= need;
  previewNight(w);
  w.events.push({ type: 'day', day: w.day, fed: w.fed, plan: w.nextWave, side: w.nextSide });
}

function economy(w, dt) {
  // farms grow food during the day
  for (const b of w.buildings) {
    if (b.type !== 'farm' || !b.done || w.night) continue;
    b.prod += dt;
    if (b.prod >= BUILDINGS.farm.foodEvery) { b.prod = 0; w.stock.food++; w.events.push({ type: 'gain', x: b.x + 0.5, y: b.y, res: 'food' }); }
  }
  // bushes regrow, new trees sprout, so the map never runs dry
  for (const k in w.nodes) {
    const n = w.nodes[k];
    if (n.t === 'bush' && n.amt <= 0 && (n.regrow -= dt) <= 0) n.amt = NODES.bush.amt;
  }
  w.sproutT += dt;
  if (w.sproutT > 20) {
    w.sproutT = 0;
    const h = hall(w);
    for (let tries = 0; tries < 30; tries++) {
      const x = randInt(w, MAP_W), y = randInt(w, MAP_H);
      if (h && Math.hypot(x - h.x, y - h.y) < 6) continue;
      if (walkable(w, x, y) && !w.villagers.some((v) => (v.x | 0) === x && (v.y | 0) === y)) {
        const t = rand(w) < 0.8 ? 'tree' : 'rock';
        w.nodes[idx(x, y)] = { t, amt: NODES[t].amt };
        w._flowDirty = true;
        w.events.push({ type: 'sprout', x, y });
        break;
      }
    }
  }
  // population growth
  w.growT += dt;
  if (w.growT >= GROW_EVERY) {
    w.growT = 0;
    if (!w.night && !isDusk(w) && w.villagers.length < popCap(w) && w.stock.food >= GROW_FOOD) {
      w.stock.food -= GROW_FOOD;
      const v = spawnVillager(w);
      w.stats.born++;
      w.events.push({ type: 'born', x: v.x, y: v.y });
    }
  }
}

// ---------- villagers ----------
function resetJob(v) {
  v.job = null; v.path = []; v.work = 0; // carried goods stay until deposited
}

function pickResource(w) {
  const want = { wood: 1, stone: 0.7, food: 0.9 };
  if (w.focus !== 'auto') want[w.focus] *= 4;
  const types = Object.keys(want).sort((a, b) => w.stock[a] / want[a] - w.stock[b] / want[b]);
  return types;
}

function stepVillager(w, v, dt) {
  if (v.hidden) return;
  const tx = v.x | 0, ty = v.y | 0;
  const pass = (x, y) => walkable(w, x, y);
  const h = hall(w);
  const goHome = w.night || isDusk(w);

  if (v.path.length) { moveAlong(v, dt, VILLAGER_SPEED); return; }

  if (!v.job) {
    if ((v.wait -= dt) > 0) return;
    v.wait = 0.4 + rand(w) * 0.4;
    if (goHome) {
      v.path = bfs(tx, ty, pass, (x, y) => nextTo(x, y, h.x, h.y, 2, 2)) || [];
      v.job = { kind: 'home' };
      return;
    }
    if (v.carry) {
      v.path = bfs(tx, ty, pass, (x, y) => nextTo(x, y, h.x, h.y, 2, 2)) || [];
      v.job = { kind: 'deposit' };
      return;
    }
    // build or repair first
    const busy = (id) => w.villagers.filter((o) => o !== v && o.job && o.job.b === id).length;
    const site = w.buildings
      .filter((b) => (!b.done || b.hp < BUILDINGS[b.type].hp) && busy(b.id) < 2)
      .sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0];
    if (site) {
      const def = BUILDINGS[site.type];
      const p = bfs(tx, ty, pass, (x, y) => nextTo(x, y, site.x, site.y, def.w, def.h));
      if (p) { v.path = p; v.job = { kind: 'build', b: site.id }; return; }
    }
    // gather
    const claimed = new Set(w.villagers.filter((o) => o !== v && o.job && o.job.node !== undefined).map((o) => o.job.node));
    for (const res of pickResource(w)) {
      let target = -1;
      const p = bfs(tx, ty, pass, (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!inMap(x + dx, y + dy)) continue;
          const i = idx(x + dx, y + dy), n = w.nodes[i];
          if (n && n.amt > 0 && NODES[n.t].gives === res && !claimed.has(i)) { target = i; return true; }
        }
        return false;
      });
      if (p) { v.path = p; v.job = { kind: 'gather', node: target, res }; return; }
    }
    return;
  }

  // arrived: do the job
  const job = v.job;
  if (job.kind === 'home') {
    if (v.carry) { w.stock[v.carry.res] += v.carry.amt; v.carry = null; }
    if (goHome) { v.hidden = true; v.job = null; }
    else v.job = null;
    return;
  }
  if (job.kind === 'deposit') {
    if (v.carry) {
      w.stock[v.carry.res] += v.carry.amt;
      w.events.push({ type: 'gain', x: v.x, y: v.y - 0.5, res: v.carry.res, amt: v.carry.amt });
      v.carry = null;
    }
    v.job = null;
    return;
  }
  if (job.kind === 'build') {
    const b = w.buildings.find((x) => x.id === job.b);
    if (!b || goHome) { v.job = null; return; }
    const def = BUILDINGS[b.type];
    v.face = b.x + def.w / 2 < v.x ? -1 : 1;
    v.work += dt;
    const sp = w.fed ? FED_BONUS : 1;
    if (!b.done) {
      dt *= sp;
      b.progress += dt;
      b.hp = Math.min(def.hp, b.hp + (def.hp * 0.75 * dt) / def.build);
      if (b.progress >= def.build) { b.done = true; b.hp = def.hp; v.job = null; w.events.push({ type: 'built', x: b.x + def.w / 2, y: b.y, btype: b.type }); }
    } else {
      b.hp = Math.min(def.hp, b.hp + 25 * dt);
      if (b.hp >= def.hp) v.job = null;
    }
    return;
  }
  if (job.kind === 'gather') {
    const n = w.nodes[job.node];
    if (!n || n.amt <= 0 || goHome) { v.job = null; return; }
    const nx = job.node % MAP_W;
    v.face = nx + 0.5 < v.x ? -1 : 1;
    v.work += dt * (w.fed ? FED_BONUS : 1);
    const per = NODES[n.t].work;
    if (v.work >= per) {
      v.work -= per;
      n.amt--;
      v.carry = v.carry || { res: job.res, amt: 0 };
      v.carry.amt++;
      w.events.push({ type: 'hit', node: job.node, t: n.t });
      if (n.amt <= 0) {
        if (n.t === 'bush') n.regrow = NODES.bush.regrow;
        else { delete w.nodes[job.node]; w._flowDirty = true; w.events.push({ type: 'depleted', node: job.node, t: n.t }); }
      }
      if (v.carry.amt >= CARRY || n.amt <= 0) v.job = null;
    }
  }
}

function moveAlong(u, dt, speed) {
  let step = speed * dt;
  while (step > 0 && u.path.length) {
    const p = u.path[0];
    const gx = p.x + 0.5, gy = p.y + 0.5;
    const dx = gx - u.x, dy = gy - u.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) u.face = dx < 0 ? -1 : 1;
    if (d <= step) { u.x = gx; u.y = gy; u.path.shift(); step -= d; }
    else { u.x += (dx / d) * step; u.y += (dy / d) * step; step = 0; }
  }
  u.moving = true;
}

// ---------- enemies ----------
function edgeTile(w, side) {
  for (let tries = 0; tries < 60; tries++) {
    const t = rand(w);
    let x, y;
    if (side === 0) { x = 0; y = (t * MAP_H) | 0; }
    else if (side === 1) { x = MAP_W - 1; y = (t * MAP_H) | 0; }
    else if (side === 2) { x = (t * MAP_W) | 0; y = 0; }
    else { x = (t * MAP_W) | 0; y = MAP_H - 1; }
    if (walkable(w, x, y)) return { x, y };
  }
  return null;
}

function spawnEnemies(w) {
  if (!w.night) return;
  const t = w.clock - DAY_LEN;
  while (w.spawnQueue.length && w.spawnQueue[0].at <= t) {
    const s = w.spawnQueue.shift();
    const p = edgeTile(w, s.side);
    if (!p) continue;
    const def = ENEMIES[s.kind];
    const hp = Math.round(def.hp * (s.hpMul || 1));
    w.enemies.push({ id: w.nextId++, kind: s.kind, x: p.x + 0.5, y: p.y + 0.5, hp, max: hp, path: [], target: 0, face: 1, attacking: false, prog: 999, best: 999, stuckT: 0 });
  }
}

function nearestBuilding(w, x, y, skipWalls = false) {
  let best = null, bd = Infinity;
  for (const b of w.buildings) {
    if (skipWalls && b.type === 'wall') continue;
    const def = BUILDINGS[b.type];
    const d = Math.hypot(Math.max(b.x - x, 0, x - (b.x + def.w)), Math.max(b.y - y, 0, y - (b.y + def.h)));
    if (d < bd) { bd = d; best = b; }
  }
  return { b: best, d: bd };
}

// Layers (game-ai skill): perceive (flow field / nearest building) -> decide (approach or attack)
// -> path (next tile downhill) -> steer (moveAlong). Stuck guard: no progress for 2 s -> give up.
function stepEnemy(w, e, dt) {
  const def = ENEMIES[e.kind];
  if (def.flying) {
    const { b, d } = nearestBuilding(w, e.x, e.y, true); // flyers ignore walls entirely
    e.prog = d;
    if (!b) return;
    if (d > 0.6) {
      const bd = BUILDINGS[b.type];
      e.path = [{ x: Math.floor(Math.min(Math.max(e.x, b.x), b.x + bd.w - 1)), y: Math.floor(Math.min(Math.max(e.y, b.y), b.y + bd.h - 1)) }];
      e.attacking = false;
      moveAlong(e, dt, def.speed);
      e.path = [];
      return;
    }
    return attack(w, e, b, def, dt);
  }
  const f = flow(w);
  const pass = (x, y) => walkable(w, x, y);
  let step = def.speed * dt;
  while (step > 0) {
    if (!e.path.length) {
      const tx = e.x | 0, ty = e.y | 0;
      e.prog = f[idx(tx, ty)];
      if (e.prog === 0) break;
      const n = downhill(f, tx, ty, pass);
      if (!n) break;
      e.path = [n];
    }
    const before = step;
    const p = e.path[0], gx = p.x + 0.5, gy = p.y + 0.5;
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) e.face = dx < 0 ? -1 : 1;
    if (d <= step) { e.x = gx; e.y = gy; e.path.shift(); step -= d; } // carry leftover distance
    else { e.x += (dx / d) * step; e.y += (dy / d) * step; step = 0; }
    if (before === step) break;
  }
  const tx = e.x | 0, ty = e.y | 0;
  if (!e.path.length && f[idx(tx, ty)] === 0) {
    let target = e.target && w.buildings.find((b) => b.id === e.target);
    if (!target || !nextToB(tx, ty, target)) {
      target = null;
      for (let dy = -1; dy <= 1 && !target; dy++) for (let dx = -1; dx <= 1 && !target; dx++) {
        const id = inMap(tx + dx, ty + dy) && w._b[idx(tx + dx, ty + dy)];
        if (id) target = w.buildings.find((b) => b.id === id);
      }
    }
    if (target) { e.target = target.id; e.stuckT = 0; return attack(w, e, target, def, dt); }
  }
  e.attacking = false;
  // stuck guard
  const prog = f[idx(tx, ty)] < 0 ? 999 : f[idx(tx, ty)];
  if (prog < e.best) { e.best = prog; e.stuckT = 0; }
  else if ((e.stuckT += dt) > 4) { e.hp = 0; e.gaveUp = true; }
}
const nextToB = (x, y, b) => { const d = BUILDINGS[b.type]; return nextTo(x, y, b.x, b.y, d.w, d.h); };

function attack(w, e, target, def, dt) {
  e.attacking = true;
  const bd = BUILDINGS[target.type];
  e.face = target.x + bd.w / 2 < e.x ? -1 : 1;
  target.hp -= def.dmg * dt;
  target.hitT = w.time;
}

function defenses(w, dt) {
  if (!w.enemies.length) return;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.type];
    if (!def.range || !b.done) continue;
    b.cd -= dt;
    if (b.cd > 0) continue;
    const cx = b.x + def.w / 2, cy = b.y + def.h / 2;
    // "first" targeting (tower-defense skill): the enemy nearest to reaching a building, not the nearest to the tower
    let best = null;
    for (const e of w.enemies) {
      if (e.hp <= 0 || Math.hypot(e.x - cx, e.y - cy) > def.range) continue;
      if (!best || e.prog < best.prog) best = e;
    }
    if (best) {
      b.cd = def.rate;
      w.shots.push({ id: w.nextId++, x: cx, y: cy - (b.type === 'tower' ? 1 : 0.6), t: best.id, dmg: def.dmg });
    }
  }
}

function stepShots(w, dt) {
  w.shots = w.shots.filter((s) => {
    const e = w.enemies.find((x) => x.id === s.t);
    if (!e) return false;
    const dx = e.x - s.x, dy = e.y - 0.3 - s.y, d = Math.hypot(dx, dy), step = 12 * dt;
    s.a = Math.atan2(dy, dx);
    if (d <= step) { e.hp -= s.dmg; w.events.push({ type: 'hurt', x: e.x, y: e.y, id: e.id }); return false; }
    s.x += (dx / d) * step; s.y += (dy / d) * step;
    return true;
  });
}

// ---------- save / load: see save.js ----------
export { serializeWorld as serialize } from './save.js';
export function deserialize(json) { return parseSave(json).w || null; }
