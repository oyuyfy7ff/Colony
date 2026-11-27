// Pure game rules: no Phaser import. The scene reads `w` and calls the exported commands.
import {
  MAP_W, MAP_H, DAY_LEN, NIGHT_LEN, WARN_TIME, T_GRASS, T_WATER, NODES, CARRY,
  VILLAGER_SPEED, VILLAGER_HP, BUILDINGS, ENEMIES, GROW_EVERY, GROW_FOOD, FED_BONUS,
  LUNCH_START, LUNCH_END, HOUSE_BEDS, ROAD_COST, ROAD_SPEED, PATH_SPEED, WEAR_PATH, TREE_GROW, NAMES,
} from './config.js';
import { bfs, dijkstra, flowField, downhill } from './path.js';
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
    v: 4, seed, rng: seed, time: 0, clock: 8, day: 1, night: false, warned: false,
    stock: { wood: 30, stone: 10, food: 20 }, focus: 'auto',
    terrain: new Array(MAP_W * MAP_H).fill(T_GRASS), nodes: {},
    buildings: [], villagers: [], enemies: [], shots: [], spawnQueue: [],
    nextId: 1, growT: 0, sproutT: 0, over: false,
    stats: { kills: 0, born: 0 }, events: [],
    fed: true, nextWave: null, nextSide: 0,
    wear: new Array(MAP_W * MAP_H).fill(0), road: new Array(MAP_W * MAP_H).fill(0),
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
      if (forest(x, y) > 0.58 && r < 0.55) w.nodes[i] = { t: 'tree', amt: NODES.tree.amt, grow: 2 };
      else if (stone(x, y) > 0.68 && r < 0.45) w.nodes[i] = { t: 'rock', amt: NODES.rock.amt };
      else if (r < 0.025) w.nodes[i] = { t: 'bush', amt: NODES.bush.amt, regrow: 0 };
      else if (r < 0.05) w.nodes[i] = { t: 'tree', amt: NODES.tree.amt, grow: 2 };
    }
  }
  // guarantee a few of each resource near the start
  const near = [['tree', 6], ['rock', 3], ['bush', 3]];
  for (const [t, n] of near) {
    for (let k = 0, tries = 0; k < n && tries < 500; tries++) {
      const a = rand(w) * Math.PI * 2, r = 5 + rand(w) * 4;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const i = y * MAP_W + x;
      if (w.terrain[i] === T_GRASS && !w.nodes[i]) { w.nodes[i] = { t, amt: NODES[t].amt, regrow: 0, grow: 2 }; k++; }
    }
  }
  for (const k in w.nodes) if (w.nodes[k].t === 'tree') w.nodes[k].style = treeStyle(w);
  addBuilding(w, 'hall', cx - 1, cy - 1, true);
  for (let k = 0; k < 3; k++) spawnVillager(w);
  rebuild(w);
  previewNight(w);
  return w;
}

// Tree looks: mostly round leafy trees, some pines, a few blossom trees.
export function treeStyle(w) { const r = rand(w); return r < 0.25 ? 'pine' : r < 0.37 ? 'blossom' : 'round'; }

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
  const used = new Set(w.villagers.map((o) => o.name));
  const free = NAMES.filter((n) => !used.has(n));
  const name = free.length ? free[randInt(w, free.length)] : NAMES[randInt(w, NAMES.length)] + ' ' + (w.villagers.length + 1);
  const v = { id: w.nextId++, name, x: hx + 0.5, y: hy + 0.5, hp: VILLAGER_HP, path: [], job: null, carry: null, work: 0, wait: rand(w), hidden: false, look: randInt(w, 8), face: 1, home: 0, emote: null, sit: false, pause: 0 };
  w.villagers.push(v);
  assignHomes(w);
  return v;
}

// ---------- homes ----------
const beds = (b) => (b.type === 'hall' ? BUILDINGS.hall.pop : b.type === 'house' ? HOUSE_BEDS : 0);
export function assignHomes(w) {
  const homes = w.buildings.filter((b) => b.done && beds(b) > 0);
  const count = new Map(homes.map((b) => [b.id, 0]));
  for (const v of w.villagers) if (count.has(v.home) && count.get(v.home) < beds(homes.find((b) => b.id === v.home))) count.set(v.home, count.get(v.home) + 1); else v.home = 0;
  // houses first, so the hall stays free for whoever is left
  const order = [...homes.filter((b) => b.type === 'house'), ...homes.filter((b) => b.type === 'hall')];
  // a finished house with free beds takes people who were sleeping in the hall
  for (const b of order) if (b.type === 'house') for (const v of w.villagers) {
    if (count.get(b.id) >= beds(b)) break;
    const cur = homes.find((x) => x.id === v.home);
    if (cur && cur.type === 'hall') { count.set(cur.id, count.get(cur.id) - 1); v.home = b.id; count.set(b.id, count.get(b.id) + 1); }
  }
  for (const v of w.villagers) {
    if (v.home) continue;
    const b = order.find((b) => count.get(b.id) < beds(b)) || hall(w);
    v.home = b ? b.id : 0;
    if (b) count.set(b.id, (count.get(b.id) || 0) + 1);
  }
}
export const homeOf = (w, v) => w.buildings.find((b) => b.id === v.home) || hall(w);
export const emote = (w, v, k, secs = 2.5) => { v.emote = { k, until: w.time + secs }; };

// ---------- roads and worn paths ----------
export function canRoad(w, x, y) { return walkable(w, x, y) && !w.road[idx(x, y)]; }
export function placeRoad(w, x, y) {
  if (w.over) return { ok: false, why: 'over' };
  if (!canRoad(w, x, y)) return { ok: false, why: 'blocked' };
  if (w.stock.stone < ROAD_COST.stone) return { ok: false, why: 'cost' };
  w.stock.stone -= ROAD_COST.stone;
  w.road[idx(x, y)] = 1;
  w.events.push({ type: 'road', x, y });
  return { ok: true };
}
const tileCost = (w, x, y) => { const i = idx(x, y); return w.road[i] ? 0.5 : w.wear[i] >= WEAR_PATH ? 0.8 : 1; };
const tileSpeed = (w, x, y) => { const i = idx(x, y); return w.road[i] ? ROAD_SPEED : w.wear[i] >= WEAR_PATH ? PATH_SPEED : 1; };
const goTo = (w, v, isGoal) => dijkstra(v.x | 0, v.y | 0, (x, y) => walkable(w, x, y), (x, y) => tileCost(w, x, y), isGoal);

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
  const def = BUILDINGS[type];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) w.road[idx(x + dx, y + dy)] = 0;
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
  // people who slept there move to the hall, still safely indoors
  const h = hall(w);
  for (const v of w.villagers) if (v.home === b.id) { v.home = 0; if (v.hidden && h) { v.x = h.x + 1; v.y = h.y + 2.5; } }
  assignHomes(w);
}

// ---------- simulation ----------
export function tick(w, dt) {
  if (w.over) return;
  w.time += dt;
  w.clock += dt;
  if (!w.night && !w.warned && w.clock >= DAY_LEN - WARN_TIME) {
    w.warned = true;
    w.events.push({ type: 'warn' });
    for (const v of w.villagers) if (!v.hidden) { resetJob(v); v.sit = false; emote(w, v, 'alert', 2); }
  }
  // lunch bell: gatherers put down their tools (builders finish the beam they are on)
  if (!w.night && w.clock >= LUNCH_START && w.clock - dt < LUNCH_START) {
    for (const v of w.villagers) if (!v.hidden && v.job && (v.job.kind === 'gather' || v.job.kind === 'stroll')) resetJob(v);
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
  assignHomes(w);
  for (const v of w.villagers) {
    if (v.hidden) {
      const home = homeOf(w, v), d = door(w, home);
      v.hidden = false; v.x = d.x + 0.5; v.y = d.y + 0.5;
      v.wait = rand(w) * 3; // stagger the morning so they don't all pop out at once
    }
    v.sit = false;
    resetJob(v);
  }
  for (let i = 0; i < w.wear.length; i++) if (w.wear[i]) w.wear[i] = Math.floor(w.wear[i] * 0.9); // unused paths grow back
  // breakfast: one food each. Fed villagers work faster today; hungry ones are just slower.
  const need = w.villagers.length;
  w.fed = w.stock.food >= need;
  if (w.fed) w.stock.food -= need;
  previewNight(w);
  for (const v of w.villagers) emote(w, v, w.fed ? 'note' : 'sad', 3);
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
    if (n.t === 'tree' && n.grow < 2) {
      n.age = (n.age || 0) + dt;
      const g = n.age >= TREE_GROW[1] ? 2 : n.age >= TREE_GROW[0] ? 1 : 0;
      if (g !== n.grow) { n.grow = g; w.events.push({ type: 'grow', node: +k, stage: g }); }
    }
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
        w.nodes[idx(x, y)] = t === 'tree' ? { t, amt: NODES[t].amt, grow: 0, age: 0, style: treeStyle(w) } : { t, amt: NODES[t].amt, grow: 2 };
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
      emote(w, v, 'heart', 3);
      w.events.push({ type: 'born', x: v.x, y: v.y, name: v.name });
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

// Front door of a building: the tile below its middle, or any free neighbour.
function door(w, b) {
  const def = BUILDINGS[b.type];
  const cands = [[b.x + (def.w >> 1), b.y + def.h], [b.x - 1, b.y + def.h - 1], [b.x + def.w, b.y + def.h - 1], [b.x, b.y - 1]];
  for (const [x, y] of cands) if (walkable(w, x, y)) return { x, y };
  return { x: b.x + (def.w >> 1), y: b.y + def.h };
}
// Plaza seats in front of the hall where villagers rest and chat at lunch.
export function plazaSeats(w) {
  const h = hall(w); if (!h) return [];
  const out = [];
  for (const [dx, dy] of [[-1, 3], [0, 4], [1, 4], [2, 3], [-1, 4], [2, 4], [3, 3], [-2, 3]]) if (walkable(w, h.x + dx, h.y + dy)) out.push({ x: h.x + dx, y: h.y + dy });
  return out;
}
const isLunch = (w) => !w.night && w.clock >= LUNCH_START && w.clock < LUNCH_END;
const ACTIVITY = { gather: { wood: 'ตัดไม้', stone: 'ขุดหิน', food: 'เก็บผลไม้' }, build: 'ก่อสร้าง', deposit: 'ขนของเข้าคลัง', home: 'กลับบ้าน', rest: 'พักกินข้าวที่ลาน', stroll: 'เดินเล่น' };
export function activity(w, v) {
  if (v.hidden) return w.night ? 'นอนหลับอยู่ในบ้าน' : 'อยู่ในบ้าน';
  if (!v.job) return 'กำลังคิดว่าจะทำอะไรดี';
  if (v.job.kind === 'gather') return ACTIVITY.gather[v.job.res];
  if (v.job.kind === 'rest' && v.sit) return 'นั่งคุยกับเพื่อนที่ลาน';
  return ACTIVITY[v.job.kind] || '';
}
// Tapping a villager: they stop, turn to the camera and wave.
export function greet(w, id) {
  const v = w.villagers.find((x) => x.id === id);
  if (!v || v.hidden) return null;
  v.pause = 1.6; v.face = 1; emote(w, v, 'wave', 1.6);
  return v;
}

function stepVillager(w, v, dt) {
  if (v.hidden) return;
  if (v.emote && v.emote.until < w.time) v.emote = null;
  if (v.pause > 0) { v.pause -= dt; return; }
  const goHome = w.night || isDusk(w);

  if (v.path.length) { moveAlong(v, dt, VILLAGER_SPEED * tileSpeed(w, v.x | 0, v.y | 0), w); return; }

  if (!v.job) {
    if ((v.wait -= dt) > 0) return;
    v.wait = 0.4 + rand(w) * 0.4;
    v.sit = false;
    const homeB = homeOf(w, v), h = hall(w);
    if (goHome) {
      const d = BUILDINGS[homeB.type];
      v.path = goTo(w, v, (x, y) => nextTo(x, y, homeB.x, homeB.y, d.w, d.h)) || [];
      v.job = { kind: 'home', b: homeB.id };
      return;
    }
    if (v.carry) {
      v.path = goTo(w, v, (x, y) => nextTo(x, y, h.x, h.y, 2, 2)) || [];
      v.job = { kind: 'deposit' };
      return;
    }
    if (isLunch(w)) {
      const taken = new Set(w.villagers.filter((o) => o !== v && o.job && o.job.kind === 'rest').map((o) => o.job.seat));
      const seats = plazaSeats(w).filter((p) => !taken.has(p.x + ',' + p.y));
      const pick = seats.length ? seats[randInt(w, seats.length)] : null;
      const goal = pick || { x: h.x + 1, y: h.y + 3 };
      const p = goTo(w, v, (x, y) => (pick ? x === goal.x && y === goal.y : Math.hypot(x - goal.x, y - goal.y) < 2.5));
      if (p) { v.path = p; v.job = { kind: 'rest', seat: pick ? pick.x + ',' + pick.y : '' }; return; }
    }
    // build or repair first
    const tx = v.x | 0, ty = v.y | 0;
    const busy = (id) => w.villagers.filter((o) => o !== v && o.job && o.job.b === id).length;
    const site = w.buildings
      .filter((b) => (!b.done || b.hp < BUILDINGS[b.type].hp) && busy(b.id) < 2)
      .sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0];
    if (site) {
      const def = BUILDINGS[site.type];
      const p = goTo(w, v, (x, y) => nextTo(x, y, site.x, site.y, def.w, def.h));
      if (p) { v.path = p; v.job = { kind: 'build', b: site.id }; return; }
    }
    // gather
    const claimed = new Set(w.villagers.filter((o) => o !== v && o.job && o.job.node !== undefined).map((o) => o.job.node));
    for (const res of pickResource(w)) {
      let target = -1;
      const p = bfs(tx, ty, (x, y) => walkable(w, x, y), (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!inMap(x + dx, y + dy)) continue;
          const i = idx(x + dx, y + dy), n = w.nodes[i];
          if (n && n.amt > 0 && (n.grow ?? 2) >= 2 && NODES[n.t].gives === res && !claimed.has(i)) { target = i; return true; }
        }
        return false;
      });
      if (p) { v.path = p; v.job = { kind: 'gather', node: target, res }; return; }
    }
    // nothing to do: take a purposeful stroll to somewhere in the village, then look around
    const spots = [door(w, homeB), ...plazaSeats(w)];
    const spot = spots[randInt(w, spots.length)];
    const p = goTo(w, v, (x, y) => Math.hypot(x - spot.x, y - spot.y) < 1.5);
    if (p) { v.path = p; v.job = { kind: 'stroll' }; }
    v.wait = 2 + rand(w) * 2;
    return;
  }

  // arrived: do the job
  const job = v.job;
  if (job.kind === 'stroll') {
    v.job = null;
    // meet someone close by: both stop, face each other and chat for a moment
    const friend = w.villagers.find((o) => o !== v && !o.hidden && !o.path.length && Math.hypot(o.x - v.x, o.y - v.y) < 2.2);
    if (friend && !friend.emote) {
      v.face = friend.x < v.x ? -1 : 1; friend.face = -v.face;
      emote(w, v, 'talk', 2); v.wait = 2.5;
      if (!friend.job || friend.job.kind === 'stroll') { friend.pause = 2.2; }
      return;
    }
    // otherwise look toward the plaza (the heart of the village) before deciding again
    const h = hall(w);
    if (h) v.face = h.x + 1 < v.x ? -1 : 1;
    v.wait = 1.5 + rand(w) * 2.5;
    return;
  }
  if (job.kind === 'rest') {
    if (!isLunch(w) || goHome) { v.job = null; v.sit = false; return; }
    v.sit = true;
    // chat: face the nearest friend sitting close by and take turns talking
    const friend = w.villagers.filter((o) => o !== v && o.sit && !o.hidden).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
    if (friend && Math.hypot(friend.x - v.x, friend.y - v.y) < 2.6) {
      v.face = friend.x < v.x ? -1 : 1;
      if (!v.emote && !friend.emote && rand(w) < dt * 0.6) emote(w, v, 'talk', 1.8);
    }
    return;
  }
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
      if (b.progress >= def.build) {
        b.done = true; b.hp = def.hp; v.job = null;
        for (const o of w.villagers) if (o.job && o.job.b === b.id || o === v) emote(w, o, 'star', 2);
        if (beds(b)) assignHomes(w);
        w.events.push({ type: 'built', x: b.x + def.w / 2, y: b.y, btype: b.type });
      }
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

// Walk along a path; villagers (w given) wear the grass on every tile they step on.
function moveAlong(u, dt, speed, w) {
  let step = speed * dt;
  while (step > 0 && u.path.length) {
    const p = u.path[0];
    const gx = p.x + 0.5, gy = p.y + 0.5;
    const dx = gx - u.x, dy = gy - u.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) u.face = dx < 0 ? -1 : 1;
    if (d <= step) {
      u.x = gx; u.y = gy; u.path.shift(); step -= d;
      if (w) { const i = idx(p.x, p.y); if (w.wear[i] < 255) w.wear[i] = Math.min(255, w.wear[i] + 3); }
    } else { u.x += (dx / d) * step; u.y += (dy / d) * step; step = 0; }
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
