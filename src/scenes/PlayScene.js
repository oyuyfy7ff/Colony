import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H, BUILDINGS, DAY_LEN, NIGHT_LEN, WARN_TIME, WEAR_PATH, T_WATER } from '../rules/config.js';
import { createWorld, tick, canPlace, canAfford, placeBuilding, demolish, buildingAt, placeRoad, canRoad, greet, activity, plazaSeats, hall as hallOf } from '../rules/world.js';
import { loadFrom, writeTo, clearFrom } from '../rules/save.js';
import { makeTextures } from '../art/sprites.js';
import { paintGround2, paintPathTile } from '../art/world-art.js';
import { TREE_VARIANTS } from '../art/cozy-art.js';
import { TIERS, Trauma, HitStop, approach } from '../feel.js';

const STEP = 1 / 30;
const AUTOSAVE_EVERY = 30; // seconds of daytime; also at every dawn. Never mid-raid.
const store = () => { try { return window.localStorage; } catch { return null; } };
const A = 'A'; // the sprite atlas
const SWAYS = new Set(['tree', 'tree_young', 'pine', 'blossom', 'fruit', 'autumn', 'golden', 'deep', 'small']);
const BIG_TREES = new Set(['tree', 'pine', 'blossom', 'fruit', 'autumn', 'golden', 'deep']);

export function loadSave() {
  const s = store();
  return s ? loadFrom(s) : { error: 'none' };
}
export function clearSave() { const s = store(); if (s) clearFrom(s); }

// Light over the day: [clock seconds, colour, alpha]. Warm sunrise, clear noon, golden
// afternoon, purple dusk; the night uses a deep blue.
const LIGHT = [[0, 0xff8a5c, 0.22], [10, 0xffc78a, 0.06], [22, 0xffffff, 0], [62, 0xffffff, 0], [75, 0xffb45c, 0.1], [88, 0xff7a4a, 0.2], [100, 0x2a1d5c, 0.42]];
const lerpColor = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255, br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

export default class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(data) {
    const loaded = data && data.fresh ? { error: 'none' } : loadSave();
    this.loadInfo = loaded;
    this.saveLocked = loaded.error === 'newer'; // never overwrite a newer build's save
    const seed = Number(new URLSearchParams(location.search).get('seed')); // fixed map for tests: ?seed=123
    this.w = loaded.w || createWorld(Number.isFinite(seed) && seed > 0 ? seed : undefined);
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.buildType = null;
    this.selected = null;
    this.selVillager = null;
    this.saveT = 0;
    this.spr = { nodes: new Map(), buildings: new Map(), villagers: new Map(), enemies: new Map(), shots: new Map() };
    this.trauma = new Trauma();
    this.hitStop = new HitStop();
    this.shakeOff = { x: 0, y: 0 };
    this.camGoal = null;
    this.fling = { vx: 0, vy: 0 };
    this.pool = [];
    this.timers = { hud: 0, mood: 0, sway: 0, paths: 0, decor: 0, smoke: 0, bird: 8, dust: 0, info: 0 };
    this.decor = [];
    this.critters = { bflies: [], flies: [], birds: [], sparkles: [] };
  }

  create() {
    makeTextures(this.textures);
    const w = this.w;
    const h = hallOf(w);
    const plaza = new Set(plazaSeats(w).map((p) => p.x + ',' + p.y));
    for (let dx = -1; dx <= 2; dx++) for (let dy = 2; dy <= 3; dy++) {
      const x = h.x + dx, y = h.y + dy;
      if (!this.isWater(x, y) && !w.nodes[y * MAP_W + x]) plaza.add(x + ',' + y);
    }
    this.plaza = plaza;
    for (const k of ['ground', 'paths']) if (this.textures.exists(k)) this.textures.remove(k);
    this.textures.addCanvas('ground', paintGround2(w, plaza));
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-1000);
    this.pathTex = this.textures.createCanvas('paths', MAP_W * TILE, MAP_H * TILE);
    this.pathLevel = new Uint8Array(MAP_W * MAP_H);
    this.add.image(0, 0, 'paths').setOrigin(0).setDepth(-999);
    this.updatePaths(true);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setRoundPixels(true);
    cam.centerOn((h.x + 1) * TILE, (h.y + 1) * TILE);
    this.setZoom(this.baseZoom());

    this.fx = this.add.graphics().setDepth(5000);
    this.ghost = this.add.image(0, 0, A, 'house').setOrigin(0, 1).setAlpha(0.6).setVisible(false).setDepth(6000);
    this.selBox = this.add.graphics().setDepth(5001);
    this.light = this.add.rectangle(0, 0, 10, 10, 0x0c1230).setOrigin(0).setScrollFactor(0).setDepth(7000).setAlpha(0);
    this.layoutLight();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.setupDecor();
    this.setupCritters();
    this.setupInput();

    const save = () => { if (document.hidden && !this.w.night) this.save(); };
    document.addEventListener('visibilitychange', save);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', save));

    this.hud = this.registry.get('hud');
    this.applySettings(this.hud.settings);
    for (let k = 0; k < 80; k++) this.pool.push(this.add.image(0, 0, A, 'puff').setVisible(false).setActive(false)); // pre-warm
    this.hud.attach(this);
    this.syncAll();
  }

  onResize() {
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.setZoom(this.baseZoom());
    this.layoutLight();
  }
  layoutLight() {
    const cam = this.cameras.main;
    this.light.setPosition(-cam.width, -cam.height).setSize(cam.width * 3, cam.height * 3);
  }
  // Camera zoom is a whole number (1 or 2) so every art pixel stays the same size.
  baseZoom() { return 1; } // the canvas is already sized so 1 shows ~200 art pixels tall
  setZoom(z) {
    const cam = this.cameras.main;
    const minZ = Math.ceil(Math.max(cam.width / (MAP_W * TILE), cam.height / (MAP_H * TILE), 1));
    const maxZ = 2;
    cam.setZoom(Phaser.Math.Clamp(Math.round(z), minZ, maxZ));
  }
  rng(seed) { let s = seed | 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296; }
  isWater(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && this.w.terrain[y * MAP_W + x] === T_WATER; }

  // ---------- decor: flower clusters, grass tufts, mushrooms, pebbles; clearings stay empty ----------
  setupDecor() {
    const w = this.w, r = this.rng(w.seed ^ 0x5eed), h = hallOf(w);
    const free = (x, y) => x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1 && !this.isWater(x, y) && !w.nodes[y * MAP_W + x] && !w._b[y * MAP_W + x] && !this.plaza.has(x + ',' + y);
    const add = (frame, wx, wy, anim) => {
      const img = this.add.image(Math.round(wx), Math.round(wy), A, anim ? frame + '_0' : frame).setOrigin(0.5, 1).setDepth(wy - 6);
      this.decor.push({ img, tx: (wx / TILE) | 0, ty: ((wy - 1) / TILE) | 0, frame, anim, ph: r() * 6 });
    };
    for (let c = 0, tries = 0; c < 22 && tries < 400; tries++) {
      const x = 1 + ((r() * (MAP_W - 2)) | 0), y = 1 + ((r() * (MAP_H - 2)) | 0);
      if (!free(x, y) || Math.hypot(x - h.x, y - h.y) < 5) continue;
      c++;
      const col = ['w', 'y', 'q', 'o'][(r() * 4) | 0], n = 3 + ((r() * 4) | 0);
      for (let k = 0; k < n; k++) { const fx = x * TILE + 8 + (r() - 0.5) * 26, fy = y * TILE + 8 + (r() - 0.5) * 22; if (free((fx / TILE) | 0, (fy / TILE) | 0)) add(`flower_${col}`, fx, fy, true); }
    }
    for (let k = 0, tries = 0; k < 90 && tries < 900; tries++) {
      const x = (r() * MAP_W) | 0, y = (r() * MAP_H) | 0;
      if (!free(x, y) || Math.hypot(x - h.x, y - h.y) < 3) continue;
      k++; add('tuft', x * TILE + 3 + r() * 10, y * TILE + 6 + r() * 9, true);
    }
    for (let k = 0, tries = 0; k < 26 && tries < 600; tries++) {
      const x = (r() * MAP_W) | 0, y = (r() * MAP_H) | 0;
      if (!free(x, y) || Math.hypot(x - h.x, y - h.y) < 4) continue;
      const nearTree = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.nodes[(y + dy) * MAP_W + x + dx]?.t === 'tree');
      if (!nearTree && r() > 0.25) continue;
      k++; add('shrub', x * TILE + 8 + (r() - 0.5) * 6, y * TILE + 14, false);
    }
    for (const key in w.nodes) {
      const i = +key, x = i % MAP_W, y = (i / MAP_W) | 0, n = w.nodes[key];
      const nb = [[1, 0], [-1, 0], [0, 1]].map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => free(a, b));
      if (!nb) continue;
      if (n.t === 'tree' && r() < 0.12) add(r() < 0.5 ? 'mushroom' : 'mushroom_b', nb[0] * TILE + 4 + r() * 8, nb[1] * TILE + 8 + r() * 6, false);
      if (n.t === 'rock' && r() < 0.4) add('pebble', nb[0] * TILE + 3 + r() * 10, nb[1] * TILE + 6 + r() * 8, false);
    }
    for (const b of w.buildings) if ((b.type === 'house' || b.type === 'farm') && b.done) this.addGarden(b, true);
    this.setupPlaza();
    this.setupShore(r, free);
  }
  // benches where villagers sit at lunch, two lamps that glow after dark. Visual only: nothing
  // here blocks walking or building (seats stay walkable tiles in the rules).
  setupPlaza() {
    const w = this.w, h = hallOf(w);
    this.lamps = [];
    for (const [dx, dy, frame] of [[-2, 4, 'well'], [3, 4, 'sign']]) {
      const tx = h.x + dx, ty = h.y + dy;
      if (this.isWater(tx, ty) || w.nodes[ty * MAP_W + tx] || w._b[ty * MAP_W + tx]) continue;
      const x = tx * TILE + 8, y = ty * TILE + 15;
      this.add.image(x, y, A, frame).setOrigin(0.5, 1).setDepth(y - 4);
      this.add.image(x, y, A, 'shadow').setDepth(y - 6).setScale(frame === 'well' ? 1.4 : 0.7, 0.7);
    }
    plazaSeats(w).slice(0, 4).forEach((p, i) => {
      if (i % 2) return; // a bench every other seat, so the plaza is not lined with furniture
      const x = p.x * TILE + 8, y = p.y * TILE + 13;
      this.add.image(x, y, A, 'bench').setOrigin(0.5, 1).setDepth(y - 8);
    });
    for (const [dx, dy] of [[-2, 2], [3, 2]]) {
      const tx = h.x + dx, ty = h.y + dy;
      if (this.isWater(tx, ty) || w.nodes[ty * MAP_W + tx] || w._b[ty * MAP_W + tx]) continue;
      const x = tx * TILE + 8, y = ty * TILE + 14;
      this.add.image(x, y, A, 'lamp').setOrigin(0.5, 1).setDepth(y);
      this.add.image(x, y + 1, A, 'shadow').setDepth(y - 2).setScale(0.6, 0.6);
      const glow = this.add.image(x, y - 12, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setDepth(7001).setAlpha(0);
      this.lamps.push(glow);
    }
  }
  // reeds along the banks (in clumps, not everywhere), a few stones, lily pads near the shore
  setupShore(r, free) {
    const w = this.w;
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      const wn = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => this.isWater(x + dx, y + dy));
      if (this.isWater(x, y)) {
        if (wn.length < 4 && r() < 0.1) {
          const img = this.add.image(x * TILE + 3 + r() * 10, y * TILE + 4 + r() * 8, A, 'lily').setDepth(-995);
          this.decor.push({ img, tx: x, ty: y, frame: 'lily', anim: false, ph: 0, water: true });
        }
        continue;
      }
      if (!wn.length || !free(x, y)) continue;
      const clump = Math.sin(x * 0.9 + w.seed) + Math.cos(y * 1.3 + w.seed * 0.5) > 0.6; // clumps along the bank
      if (clump && r() < 0.75) {
        const [dx, dy] = wn[0];
        for (let k = 0; k < 2 + ((r() * 2) | 0); k++) {
          const rx = x * TILE + 8 + dx * 5 + (r() - 0.5) * 8, ry = y * TILE + 10 + dy * 4 + (r() - 0.5) * 6;
          const img = this.add.image(Math.round(rx), Math.round(ry), A, 'reed_0').setOrigin(0.5, 1).setDepth(ry - 6);
          this.decor.push({ img, tx: x, ty: y, frame: 'reed', anim: true, ph: r() * 6 });
        }
      } else if (r() < 0.08) {
        const img = this.add.image(x * TILE + 4 + r() * 8, y * TILE + 8 + r() * 6, A, 'pebble').setOrigin(0.5, 1).setDepth(y * TILE);
        this.decor.push({ img, tx: x, ty: y, frame: 'pebble', anim: false, ph: 0 });
      }
    }
  }
  // a little flower bed grows beside every finished house: the village changes as it grows
  addGarden(b, instant) {
    const def = BUILDINGS[b.type], w = this.w;
    const SETS = b.type === 'farm'
      ? [['hay', 'crate', null], ['hay', null, 'barrel'], [null, 'hay', 'crate']]
      : [['flowerbed', 'fence', 'shrub'], ['barrel', 'mailbox', 'crate'], ['logs', 'flowerbed', 'mailbox'], ['shrub', 'barrel', 'flowerbed']];
    const set = SETS[b.id % SETS.length];
    const spots = [[b.x - 1, b.y + def.h - 1], [b.x + def.w, b.y + def.h - 1], [b.x - 1, b.y + def.h - 2]];
    let k = 0;
    spots.forEach(([x, y], n) => {
      const frame = set[n], i = y * MAP_W + x;
      if (!frame || x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || this.isWater(x, y) || w._b[i] || w.nodes[i]) return;
      const wx = x * TILE + 8, wy = y * TILE + 15;
      const img = this.add.image(wx, wy, A, frame).setOrigin(0.5, 1).setDepth(wy - 6);
      if (!instant) { img.setScale(0.2); this.tweens.add({ targets: img, scale: 1, duration: 400, delay: k++ * 150, ease: 'Back.Out' }); }
      this.decor.push({ img, tx: x, ty: y, frame, anim: false, ph: 0 });
    });
  }
  // a cut tree leaves a stump that stays until something grows or is built there
  addStump(node) {
    const x = node % MAP_W, y = (node / MAP_W) | 0;
    if (this.decor.some((d) => d.frame === 'stump' && d.tx === x && d.ty === y)) return; // one stump per tile
    const img = this.add.image(x * TILE + 8, y * TILE + 14, A, 'stump').setOrigin(0.5, 1).setDepth(y * TILE + 8);
    this.decor.push({ img, tx: x, ty: y, frame: 'stump', anim: false, ph: 0 });
  }
  refreshDecor() { // decor disappears under buildings, roads, nodes and worn paths
    const w = this.w;
    for (const d of this.decor) { if (d.water) continue; const i = d.ty * MAP_W + d.tx; d.img.setVisible(!(w._b[i] || w.road[i] || w.wear[i] >= WEAR_PATH || w.nodes[i])); }
  }

  // ---------- worn paths and roads: one canvas layer, repainted per changed tile ----------
  levelAt(i) { const w = this.w; return w._b[i] ? 0 : w.road[i] ? 3 : w.wear[i] >= WEAR_PATH ? 2 : w.wear[i] >= WEAR_PATH / 2 ? 1 : 0; }
  updatePaths(all) {
    const w = this.w, dirty = new Set();
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const lv = this.levelAt(i);
      if (lv === this.pathLevel[i] && !(all && lv)) continue;
      this.pathLevel[i] = lv;
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < MAP_W && y + dy < MAP_H) dirty.add((y + dy) * MAP_W + x + dx);
    }
    if (!dirty.size) return;
    const L = this.pathLevel, ctx = this.pathTex.context;
    const at = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 0 : L[y * MAP_W + x]);
    for (const i of dirty) {
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      paintPathTile(ctx, x, y, L[i], { l: at(x - 1, y), r: at(x + 1, y), t: at(x, y - 1), b: at(x, y + 1) }, w.seed);
    }
    this.pathTex.refresh();
  }

  // ---------- critters: butterflies by day, fireflies at night, birds now and then, water sparkles ----------
  setupCritters() {
    const r = this.rng(this.w.seed ^ 0xb17d);
    const flowers = this.decor.filter((d) => d.frame.startsWith('flower'));
    for (let k = 0; k < 7; k++) {
      const col = ['y', 'q', 'w'][k % 3];
      const f = flowers.length ? flowers[(r() * flowers.length) | 0].img : { x: 200 + r() * 300, y: 150 + r() * 200 };
      const img = this.add.image(f.x, f.y - 10, A, `bfly_${col}_0`).setDepth(4500);
      this.critters.bflies.push({ img, col, x: f.x, y: f.y - 10, hx: f.x, hy: f.y - 10, tx: f.x, ty: f.y, ph: r() * 6 });
    }
    for (let k = 0; k < 16; k++) {
      const x = r() * MAP_W * TILE, y = r() * MAP_H * TILE;
      const glow = this.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.18).setDepth(7002).setAlpha(0);
      const dot = this.add.image(x, y, A, 'firefly').setDepth(7003).setAlpha(0);
      this.critters.flies.push({ glow, dot, x, y, ph: r() * 6, sp: 0.5 + r() });
    }
    for (let tries = 0, n = 0; tries < 400 && n < 14; tries++) {
      const x = (r() * MAP_W) | 0, y = (r() * MAP_H) | 0;
      if (!this.isWater(x, y) || !this.isWater(x, y - 1)) continue;
      n++;
      this.critters.sparkles.push({ img: this.add.image(x * TILE + 3 + r() * 10, y * TILE + 4 + r() * 8, A, 'sparkle_0').setDepth(-990).setAlpha(0), ph: r() * 6, sp: 0.6 + r() * 0.8 });
    }
    // slow ripples drifting on open water
    this.critters.ripples = [];
    for (let tries = 0; tries < 500 && this.critters.ripples.length < 18; tries++) {
      const x = (r() * MAP_W) | 0, y = (r() * MAP_H) | 0;
      if (!this.isWater(x, y) || !this.isWater(x - 1, y) || !this.isWater(x + 1, y)) continue;
      const bx = x * TILE + 8, by = y * TILE + 4 + r() * 8;
      this.critters.ripples.push({ img: this.add.image(bx, by, A, 'ripple_0').setDepth(-991).setAlpha(0), bx, by, ph: r() * 6 });
    }
  }
  updateCritters(dt, now, dayAmt) {
    for (const b of this.critters.bflies) {
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 4) { b.tx = b.hx + (Math.random() - 0.5) * 60; b.ty = b.hy + (Math.random() - 0.5) * 40; }
      b.x = approach(b.x, b.tx, 0.8, dt); b.y = approach(b.y, b.ty, 0.8, dt);
      b.img.setFrame(`bfly_${b.col}_${((now / 90 + b.ph * 3) | 0) % 2}`).setPosition(Math.round(b.x), Math.round(b.y + Math.sin(now / 200 + b.ph) * 3)).setAlpha(dayAmt).setDepth(b.y + 20);
    }
    const night = 1 - dayAmt;
    for (const f of this.critters.flies) {
      f.x += Math.sin((now / 1300) * f.sp + f.ph) * 6 * dt; f.y += Math.cos((now / 1700) * f.sp + f.ph) * 5 * dt;
      const blink = Math.max(0, Math.sin((now / 500) * f.sp + f.ph)) * night;
      f.glow.setPosition(f.x, f.y).setAlpha(blink * 0.8); f.dot.setPosition(Math.round(f.x), Math.round(f.y)).setAlpha(blink);
    }
    for (const rp of this.critters.ripples) {
      const t = now / 2600 + rp.ph;
      rp.img.setPosition(Math.round(rp.bx + Math.sin(t) * 6), rp.by).setFrame(Math.sin(t * 2) > 0 ? 'ripple_1' : 'ripple_0').setAlpha(0.25 + 0.2 * Math.sin(t * 1.3));
    }
    for (const s of this.critters.sparkles) {
      const v = Math.sin((now / 400) * s.sp + s.ph);
      s.img.setFrame(v > 0.6 ? 'sparkle_0' : 'sparkle_1').setAlpha(Math.max(0, v) * (0.4 + dayAmt * 0.6));
    }
    this.timers.bird -= dt;
    if (this.timers.bird <= 0 && dayAmt > 0.6) {
      this.timers.bird = 18 + Math.random() * 25;
      const view = this.cameras.main.worldView, dir = Math.random() < 0.5 ? 1 : -1, y0 = view.y + 20 + Math.random() * view.height * 0.5;
      for (let k = 0; k < 2 + ((Math.random() * 2) | 0); k++) {
        const x0 = (dir > 0 ? view.x - 20 : view.right + 20) - dir * k * 12;
        const img = this.add.image(x0, y0 + k * 7, A, 'bird_0').setDepth(6900).setFlipX(dir < 0);
        const sh = this.add.image(x0, y0 + k * 7 + 30, A, 'shadow').setDepth(-900).setAlpha(0.5).setScale(0.6, 0.5);
        this.critters.birds.push({ img, sh, vx: dir * (40 + Math.random() * 10), ph: Math.random() * 6, life: (view.width + 80) / 40 + 1 });
      }
    }
    this.critters.birds = this.critters.birds.filter((b) => {
      b.life -= dt;
      b.img.x += b.vx * dt; b.sh.x = b.img.x + 4;
      b.img.setFrame(`bird_${((now / 140 + b.ph) | 0) % 2}`);
      if (b.life > 0) return true;
      b.img.destroy(); b.sh.destroy(); return false;
    });
  }

  // ---------- input: drag to pan (or paint roads), pinch / wheel to zoom, tap to act ----------
  setupInput() {
    this.input.addPointer(1);
    const cam = this.cameras.main;
    let drag = null, pinch = null;
    this.input.on('pointerdown', (p) => {
      const pts = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
      if (pts.length === 2) { pinch = { d: Phaser.Math.Distance.BetweenPoints(pts[0].position, pts[1].position), z: cam.zoom }; drag = null; return; }
      this.camGoal = null; this.fling.vx = this.fling.vy = 0;
      drag = { x: p.x, y: p.y, sx: cam.scrollX - this.shakeOff.x, sy: cam.scrollY - this.shakeOff.y, moved: false, lx: p.x, ly: p.y, lt: performance.now() };
    });
    this.input.on('pointermove', (p) => {
      if (pinch) {
        const a = this.input.pointer1, b = this.input.pointer2;
        if (a.isDown && b.isDown) this.setZoom(pinch.z * (Phaser.Math.Distance.BetweenPoints(a.position, b.position) / pinch.d));
        return;
      }
      if (this.buildType && !p.isDown) this.moveGhost(p);
      if (!drag || !p.isDown) return;
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; this.lastRoad = null; this.warnedRoad = false; }
      if (!drag.moved) return;
      if (this.buildType === 'road') { this.paintRoad(p); return; } // drag paints a road instead of panning
      cam.setScroll(drag.sx - dx / cam.zoom + this.shakeOff.x, drag.sy - dy / cam.zoom + this.shakeOff.y);
      const now = performance.now(), dt = Math.max(1, now - drag.lt) / 1000;
      this.fling.vx = -(p.x - drag.lx) / cam.zoom / dt; this.fling.vy = -(p.y - drag.ly) / cam.zoom / dt;
      drag.lx = p.x; drag.ly = p.y; drag.lt = now;
    });
    this.input.on('pointerup', (p) => {
      if (pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) pinch = null; drag = null; return; }
      if (drag && !drag.moved) this.tap(p);
      if (drag && drag.moved && (performance.now() - drag.lt > 80 || this.buildType === 'road')) this.fling.vx = this.fling.vy = 0;
      drag = null;
    });
    this.input.on('wheel', (_p, _o, _dx, dy) => this.setZoom(cam.zoom + (dy > 0 ? -1 : 1)));
  }
  tileAt(p) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(wp.x / TILE), y: Math.floor(wp.y / TILE), wx: wp.x, wy: wp.y };
  }
  moveGhost(p) {
    const t = this.tileAt(p);
    if (this.buildType === 'road') {
      const ok = canRoad(this.w, t.x, t.y) && this.w.stock.stone >= 1;
      this.ghostTile = { x: t.x, y: t.y, w: 1, h: 1, ok };
      this.ghost.setFrame('site_0').setPosition(t.x * TILE, (t.y + 1) * TILE).setVisible(true).setTint(ok ? 0xffffff : 0xff5050);
      return;
    }
    const ok = canPlace(this.w, this.buildType, t.x, t.y) && canAfford(this.w, this.buildType);
    const def = BUILDINGS[this.buildType];
    this.ghostTile = { x: t.x, y: t.y, w: def.w, h: def.h, ok };
    this.ghost.setFrame(this.buildType).setPosition(t.x * TILE + (def.w * TILE - this.ghost.width) / 2, (t.y + def.h) * TILE).setVisible(true).setTint(ok ? 0xffffff : 0xff5050);
  }
  paintRoad(p) {
    const t = this.tileAt(p);
    if (this.lastRoad === t.x + ',' + t.y) return;
    this.lastRoad = t.x + ',' + t.y;
    const res = placeRoad(this.w, t.x, t.y);
    if (res.ok) { this.dust(t.x * TILE + 8, t.y * TILE + 12, 3); this.hud.sfx('place'); this.updatePaths(); this.hud.onEvent({ type: 'placed' }); }
    else if (res.why === 'cost' && !this.warnedRoad) { this.warnedRoad = true; this.hud.toast('หินไม่พอสำหรับทำถนน', 'bad'); this.hud.sfx('bad'); }
  }
  tap(p) {
    const t = this.tileAt(p);
    if (this.buildType === 'road') { this.lastRoad = null; this.warnedRoad = false; this.paintRoad(p); this.hud.refresh(); return; }
    if (this.buildType) {
      const res = placeBuilding(this.w, this.buildType, t.x, t.y);
      this.moveGhost(p);
      if (res.ok) { this.feedback('small', (t.x + 0.5) * TILE, (t.y + 0.8) * TILE); this.hud.sfx('place'); this.hud.onEvent({ type: 'placed' }); }
      else {
        this.hud.toast(res.why === 'cost' ? 'ทรัพยากรไม่พอ' : 'วางตรงนี้ไม่ได้', 'bad'); this.hud.sfx('bad');
        const gx = this.ghost.x; this.tweens.add({ targets: this.ghost, x: gx + 2, duration: 40, yoyo: true, repeat: 2, onComplete: () => { this.ghost.x = gx; } });
      }
      this.hud.refresh();
      return;
    }
    // a villager near the tap stops, turns and waves
    let best = null, bd = 12;
    for (const v of this.w.villagers) {
      if (v.hidden) continue;
      const d = Math.hypot(v.x * TILE - t.wx, v.y * TILE - 2 - t.wy);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) { greet(this.w, best.id); this.selectVillager(best.id); this.hud.sfx('click'); return; }
    const b = buildingAt(this.w, t.x, t.y);
    this.select(b ? b.id : null);
  }

  // ---------- commands from the HUD ----------
  setBuild(type) {
    this.buildType = type;
    this.select(null);
    if (type) { const cam = this.cameras.main; this.moveGhost({ x: cam.width / 2, y: cam.height / 2 }); }
    else { this.ghost.setVisible(false); this.ghostTile = null; }
  }
  focusHall() { const h = hallOf(this.w); this.camGoal = { x: (h.x + 1) * TILE, y: (h.y + 1) * TILE }; }
  focusSide(side) {
    const h = hallOf(this.w), cam = this.cameras.main;
    const cx = (h.x + 1) * TILE, cy = (h.y + 1) * TILE, dx = cam.width / cam.zoom / 2.5, dy = cam.height / cam.zoom / 2.5;
    this.camGoal = [{ x: cx - dx, y: cy }, { x: cx + dx, y: cy }, { x: cx, y: cy - dy }, { x: cx, y: cy + dy }][side];
  }
  applySettings(s) { this.trauma.strength = s.shake; this.reduceFlash = s.reduceFlash; }
  select(id) {
    this.selected = id; this.selVillager = null;
    this.hud.showInfo(id ? this.w.buildings.find((b) => b.id === id) : null);
  }
  selectVillager(id) {
    this.selected = null; this.selVillager = id;
    const v = this.w.villagers.find((x) => x.id === id);
    if (!v || v.hidden) { this.selVillager = null; this.hud.showInfo(null); return; }
    this.hud.showVillager({ name: v.name, doing: activity(this.w, v), look: v.look });
  }
  demolishSelected() {
    const b = this.w.buildings.find((x) => x.id === this.selected);
    if (b && demolish(this.w, b.id)) {
      const def = BUILDINGS[b.type];
      this.puffs((b.x + def.w / 2) * TILE, (b.y + def.h) * TILE, 8);
      this.select(null);
    }
  }
  save() {
    const s = store();
    if (!s || this.saveLocked || this.w.over) return;
    const r = writeTo(s, this.w);
    if (!r.ok && !this.saveWarned) { this.saveWarned = true; this.hud.toast(r.error === 'full' ? 'บันทึกไม่ได้: พื้นที่เก็บข้อมูลเต็ม' : 'บันทึกไม่ได้ในเบราว์เซอร์นี้', 'bad'); }
  }

  // ---------- loop ----------
  update(time, deltaMs) {
    const w = this.w, T = this.timers;
    const dt = Math.min(deltaMs / 1000, 0.1);
    if (!this.paused && !w.over) {
      this.acc += dt * this.speed * this.hitStop.scale(time);
      while (this.acc >= STEP) { tick(w, STEP); this.acc -= STEP; }
      if (!w.night) { this.saveT += dt; if (this.saveT > AUTOSAVE_EVERY) { this.saveT = 0; this.save(); } }
    }
    this.handleEvents();
    this.syncAll();
    this.updateCamera(dt);
    const dayAmt = this.updateLight();
    this.updateCritters(dt, time, dayAmt);
    if ((T.sway += dt) > 0.12) { T.sway = 0; this.updateSway(time); }
    if ((T.paths += dt) > 0.5) { T.paths = 0; this.updatePaths(); }
    if ((T.decor += dt) > 1) { T.decor = 0; this.refreshDecor(); }
    if ((T.smoke += dt) > 0.25) { T.smoke = 0; this.emitSmoke(); }
    if ((T.dust += dt) > 0.3) { T.dust = 0; this.siteDust(); }
    if ((T.hud += dt) > 0.25) { T.hud = 0; this.hud.clock(); }
    if ((T.info += dt) > 0.5) { T.info = 0; if (this.selVillager) this.selectVillager(this.selVillager); }
    if ((T.mood += dt) > 0.5) {
      T.mood = 0;
      const section = w.night ? 'night' : (w.clock > DAY_LEN - WARN_TIME ? 'dusk' : 'day');
      this.hud.audio.setMood(section, Math.min(1, w.enemies.length / 10));
    }
  }

  // camera (camera-systems skill): remove last frame's shake, apply smooth pan or fling, add shake on top
  updateCamera(dt) {
    const cam = this.cameras.main;
    let x = cam.scrollX - this.shakeOff.x, y = cam.scrollY - this.shakeOff.y;
    if (this.camGoal) {
      const gx = this.camGoal.x - cam.width / 2, gy = this.camGoal.y - cam.height / 2;
      x = approach(x, gx, 7, dt); y = approach(y, gy, 7, dt);
      if (Math.hypot(gx - x, gy - y) < 0.5) this.camGoal = null;
    } else if (Math.abs(this.fling.vx) + Math.abs(this.fling.vy) > 5 && !this.input.activePointer.isDown) {
      x += this.fling.vx * dt; y += this.fling.vy * dt;
      const k = Math.exp(-5 * dt);
      this.fling.vx *= k; this.fling.vy *= k;
    }
    this.shakeOff = this.trauma.update(dt);
    cam.setScroll(x + this.shakeOff.x, y + this.shakeOff.y);
  }

  feedback(tier, x, y, tint) {
    const T = TIERS[tier];
    this.trauma.add(T.trauma);
    this.hitStop.start(this.time.now, T.stop);
    this.puffs(x, y, T.parts, tint);
  }

  handleEvents() {
    const w = this.w;
    for (const ev of w.events) {
      switch (ev.type) {
        case 'gain': this.gainPop(ev.x * TILE, ev.y * TILE, ev.res, ev.amt); break;
        case 'hit': this.shakeNode(ev.node); if (this.isOnScreen(ev.node)) { this.hud.sfx('chop'); this.chips(ev.node, ev.t); } break;
        case 'depleted': this.puffs(((ev.node % MAP_W) + 0.5) * TILE, (((ev.node / MAP_W) | 0) + 0.8) * TILE, 5); if (ev.t === 'tree') this.addStump(ev.node); break;
        case 'grow': { const s = this.spr.nodes.get(ev.node); if (s) { s.setScale(0.8, 1.2); this.tweens.add({ targets: s, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.Out' }); } break; }
        case 'die': this.feedback('small', ev.x * TILE, ev.y * TILE, { slime: 0x9a5bd8, goblin: 0x38b764, bat: 0x5d275d }[ev.kind]); this.hud.sfx('kill'); break;
        case 'flee': this.puffs(ev.x * TILE, ev.y * TILE, 4); break;
        case 'hurt': this.flash(ev.id); this.hud.sfx('hit'); break;
        case 'born': this.puffs(ev.x * TILE, ev.y * TILE, 6, 0xffcd75); this.hud.toast(`${ev.name} เกิดในหมู่บ้าน!`, 'good'); this.hud.sfx('born'); break;
        case 'built': {
          this.dust(ev.x * TILE, (ev.y + 1) * TILE, 14); this.hud.sfx('built');
          if (ev.btype === 'house' || ev.btype === 'farm') { const b = w.buildings.find((x) => x.type === ev.btype && x.x + BUILDINGS[ev.btype].w / 2 === ev.x && x.y === ev.y); if (b) this.addGarden(b); }
          break;
        }
        case 'destroyed': this.feedback('large', ev.x * TILE, ev.y * TILE, 0x566c86); this.hud.sfx('boom'); this.hud.toast(`${BUILDINGS[ev.btype].name}ถูกทำลาย!`, 'bad'); break;
        case 'warn': this.hud.toast('ใกล้ค่ำแล้ว ชาวบ้านกำลังเดินกลับบ้าน', 'warn'); break;
        case 'night': this.hud.toast(`กลางคืน! ศัตรู ${ev.plan.groups.reduce((a, g) => a + g.count, 0)} ตัวมาจากทิศ${['ตะวันตก', 'ตะวันออก', 'เหนือ', 'ใต้'][ev.side]}`, 'bad'); this.hud.sfx('night'); break;
        case 'day': {
          this.hud.toast(`รุ่งเช้า วันที่ ${ev.day} ${ev.fed ? 'กินอิ่ม ทำงานเร็วขึ้น' : 'อาหารไม่พอ ทำงานช้าลง'}`, ev.fed ? 'good' : 'warn');
          const fresh = ev.plan.fresh.filter((k) => k !== 'slime');
          if (fresh.length) this.hud.toast(fresh.includes('bat') ? 'คืนนี้มีค้างคาว! บินข้ามกำแพงได้ ต้องใช้หอธนู' : 'คืนนี้มีก็อบลิน! ตัวใหญ่ ทนทาน', 'warn');
          if (ev.plan.tag === 'spike') this.hud.toast('คืนนี้คืนเดือนแดง ศัตรูมากกว่าปกติ', 'bad');
          this.hud.sfx('day'); this.save(); break;
        }
        case 'over': this.hud.gameOver(); clearSave(); this.feedback('large', this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, 0xb13e53); break;
      }
    }
    for (const ev of w.events) this.hud.onEvent(ev);
    w.events.length = 0;
  }
  isOnScreen(node) {
    return this.cameras.main.worldView.contains(((node % MAP_W) + 0.5) * TILE, (((node / MAP_W) | 0) + 0.5) * TILE);
  }

  // ---------- render sync ----------
  nodeFrame(n) {
    if (n.t === 'bush') return n.amt <= 0 ? 'bush_empty' : 'bush';
    if (n.t === 'tree') return (n.grow ?? 2) === 0 ? 'sapling' : n.grow === 1 ? 'tree_young' : (!n.style || n.style === 'round' ? 'tree' : n.style);
    if (n.t === 'rock') return this.rockLook(n);
    return n.t;
  }
  variantFrame(n, fr) { // grown leafy trees: one of TREE_VARIANTS shapes, fixed per tree
    if (n.t !== 'tree' || !this.textures.get(A).has(fr + '~1')) return fr;
    n.v ??= (Math.random() * TREE_VARIANTS) | 0;
    return n.v ? `${fr}~${n.v}` : fr;
  }
  rockLook(n) { // three rock shapes, fixed per rock
    if (n.look === undefined) n.look = (Math.random() * 3) | 0;
    return ['rock', 'rock_1', 'rock_2'][n.look];
  }
  syncAll() {
    const w = this.w, now = this.time.now;
    const seen = new Set();
    for (const k in w.nodes) {
      const n = w.nodes[k], i = +k;
      seen.add(i);
      let s = this.spr.nodes.get(i);
      const fr = this.nodeFrame(n);
      if (!s) {
        const x = ((i % MAP_W) + 0.5) * TILE, y = (((i / MAP_W) | 0) + 1) * TILE;
        s = this.add.image(x, y, A, this.variantFrame(n, fr)).setOrigin(0.5, 1).setDepth(y);
        s.baseX = s.x; s.base = fr; s.fr = s.frame.name;
        if (n.t === 'tree') s.setFlipX(n.flip ??= Math.random() < 0.5);
        s.shadow = this.add.image(x, y - 1, A, 'shadow_l').setDepth(y - 2).setScale(BIG_TREES.has(fr) ? 1.1 : fr === 'small' ? 0.8 : 0.6, 1);
        this.spr.nodes.set(i, s);
        s.setScale(0.2); this.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.Out' });
      } else if (s.base !== fr) { s.base = fr; s.setFrame(this.variantFrame(n, fr)); s.fr = s.frame.name; s.shadow.setScale(BIG_TREES.has(fr) ? 1.1 : fr === 'small' ? 0.8 : 0.6, 1); }
    }
    for (const [i, s] of this.spr.nodes) if (!seen.has(i)) { s.shadow.destroy(); s.destroy(); this.spr.nodes.delete(i); }

    const bseen = new Set();
    for (const b of w.buildings) {
      bseen.add(b.id);
      const def = BUILDINGS[b.type];
      let o = this.spr.buildings.get(b.id);
      // construction shows step by step: stakes, frame, half walls, finished
      const fr = b.done ? (b.type === 'house' ? `house_${b.id % 9}` : b.type === 'farm' ? `farm_${b.id % 3}` : b.type) : `site_${Math.min(2, Math.floor((b.progress / def.build) * 3))}`;
      if (!o) {
        const x = (b.x + def.w / 2) * TILE, y = (b.y + def.h) * TILE;
        const img = this.add.image(x, y, A, fr).setOrigin(0.5, 1).setDepth(y - 1);
        const shadow = this.add.image(x, y - 1, A, def.w > 1 ? 'shadow_xl' : 'shadow_l').setDepth(y - 3);
        const glow = def.range || b.type === 'house'
          ? this.add.image(x, y - def.h * TILE * 0.6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(7001).setScale(b.type === 'hall' ? 2.2 : 1.3).setAlpha(0)
          : null;
        o = { img, glow, shadow, fr };
        this.spr.buildings.set(b.id, o);
      }
      if (o.fr !== fr) {
        o.fr = fr;
        o.img.setFrame(fr).setScale(1.15, 0.85);
        this.tweens.add({ targets: o.img, scaleX: 1, scaleY: 1, duration: 250, ease: 'Back.Out' });
        this.dust(o.img.x, o.img.y - 2, b.done ? 10 : 4);
      }
      o.img.setTint(b.hitT && w.time - b.hitT < 0.12 && !this.reduceFlash ? 0xff9090 : 0xffffff);
      if (o.glow) o.glow.setVisible(b.done);
    }
    for (const [id, o] of this.spr.buildings) if (!bseen.has(id)) { o.img.destroy(); o.shadow.destroy(); o.glow?.destroy(); this.spr.buildings.delete(id); }

    // villagers: walk frames, sitting, breathing when idle, a hop while working, emote bubbles
    this.syncUnits(this.spr.villagers, w.villagers, (v) => `vill${v.look}_`, (v, s, moving) => {
      s.setVisible(!v.hidden);
      if (v.sit) s.setFrame(`vill${v.look}_sit`);
      if (!s.carry) s.carry = this.add.image(0, 0, A, 'ic_wood').setOrigin(0.5, 1);
      s.carry.setVisible(!v.hidden && !!v.carry);
      if (v.carry) s.carry.setFrame(`ic_${v.carry.res}`).setPosition(s.x, s.y - 19).setDepth(s.depth + 1);
      const working = v.job && !v.path.length && (v.job.kind === 'gather' || v.job.kind === 'build');
      if (working) s.y -= Math.abs(Math.sin(now / 90)) * 2;
      else if (!moving && !v.sit && ((now / 600 + v.id) | 0) % 2) s.y -= 1;
      if (!s.bubble) s.bubble = this.add.image(0, 0, A, 'emo_talk').setOrigin(0.5, 1).setVisible(false);
      const ek = v.emote && !v.hidden ? v.emote.k : null;
      if (ek !== s.ek) { s.ek = ek; if (ek) { s.bubble.setFrame(`emo_${ek}`).setScale(0.3); this.tweens.add({ targets: s.bubble, scale: 1, duration: 220, ease: 'Back.Out' }); } }
      s.bubble.setVisible(!!ek).setPosition(s.x, s.y - (v.carry ? 27 : 20) - Math.abs(Math.sin(now / 250))).setDepth(6800);
    });

    this.separate([...this.spr.villagers.values()].filter((s) => s.visible));
    this.syncUnits(this.spr.enemies, w.enemies, (e) => (e.kind === 'slime' ? 'slime' : `${e.kind}_`), (e, s) => {
      if (e.kind === 'bat') { s.y -= 10 + Math.sin(now / 120 + e.id) * 2; s.setFrame(`bat_${((now / 110) | 0) % 2}`); }
      if (e.kind === 'slime') { const t = now / 140 + e.id; s.setScale(1 + Math.sin(t) * 0.12, 1 - Math.sin(t) * 0.12); }
      if (e.attacking) s.x += Math.sin(now / 50);
      if (s.flashUntil > now) { if (this.reduceFlash) s.setTint(0xff9090).setTintMode(Phaser.TintModes.MULTIPLY); else s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); }
      else s.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    });

    const sseen = new Set();
    for (const sh of w.shots) {
      sseen.add(sh.id);
      let s = this.spr.shots.get(sh.id);
      if (!s) { s = this.add.image(0, 0, A, 'arrow').setDepth(4000); this.spr.shots.set(sh.id, s); }
      s.setPosition(sh.x * TILE, sh.y * TILE).setRotation(sh.a || 0);
    }
    for (const [id, s] of this.spr.shots) if (!sseen.has(id)) { s.destroy(); this.spr.shots.delete(id); }
    this.drawBars();
  }

  syncUnits(map, list, texOf, extra) {
    const seen = new Set();
    const now = this.time.now;
    for (const u of list) {
      seen.add(u.id);
      let s = map.get(u.id);
      const base = texOf(u);
      const animated = base.endsWith('_');
      if (!s) {
        s = this.add.image(u.x * TILE, u.y * TILE, A, animated ? base + '0' : base).setOrigin(0.5, 1);
        s.shadow = this.add.image(0, 0, A, 'shadow');
        s.lastX = u.x; s.lastY = u.y;
        map.set(u.id, s);
      }
      const moving = Math.abs(u.x - s.lastX) + Math.abs(u.y - s.lastY) > 0.0005;
      s.lastX = u.x; s.lastY = u.y;
      if (animated) s.setFrame(base + (moving ? ((now / 150) | 0) % 2 : 0));
      s.setPosition(Math.round(u.x * TILE), Math.round(u.y * TILE + 5));
      s.setFlipX(u.face < 0);
      s.setDepth(s.y);
      s.shadow.setPosition(s.x, s.y).setDepth(s.y - 0.5);
      extra(u, s, moving);
      s.shadow.setVisible(s.visible);
    }
    for (const [id, s] of map) if (!seen.has(id)) { s.shadow.destroy(); s.carry?.destroy(); s.bubble?.destroy(); s.destroy(); map.delete(id); }
  }

  separate(list) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 4) {
        const d = a.x <= b.x ? -3 : 3;
        a.x += d; b.x -= d;
        for (const s of [a, b]) { s.shadow.x = s.x; if (s.carry) s.carry.x = s.x; if (s.bubble) s.bubble.x = s.x; }
      }
    }
  }

  // trees, tufts and flowers lean with a wind wave that rolls across the map (visible ones only)
  updateSway(now) {
    const view = this.cameras.main.worldView;
    const gust = 0.6 + 0.4 * Math.sin(now / 4000);
    const phase = (x, y) => Math.sin(now / 700 - x * 0.025 - y * 0.012) * gust;
    for (const s of this.spr.nodes.values()) {
      if (!SWAYS.has(s.base)) continue;
      if (!view.contains(s.x, s.y - 8)) continue;
      const p = phase(s.x, s.y);
      s.setFrame(p > 0.55 ? s.fr + '_b' : p < -0.75 ? s.fr + '_a' : s.fr);
      // in a strong gust a leaf sometimes drifts off a round tree (daytime only, a few at a time)
      if (p > 0.9 && (s.base === 'tree' || s.base === 'blossom' || s.base === 'autumn' || s.base === 'golden') && !this.w.night && (this.leaves || 0) < 6 && Math.random() < (s.base === 'blossom' ? 0.08 : 0.04)) this.leafFall(s.x, s.y - 20, { blossom: 0xffc6e3, autumn: 0xffa060, golden: 0xffe080 }[s.base] || 0xffffff);
    }
    for (const d of this.decor) {
      if (!d.anim || !d.img.visible || !view.contains(d.img.x, d.img.y)) continue;
      d.img.setFrame(`${d.frame}_${phase(d.img.x, d.img.y) + Math.sin(d.ph) * 0.2 > 0.3 ? 1 : 0}`);
    }
  }

  drawBars() {
    const g = this.fx;
    g.clear();
    const bar = (x, y, wd, frac, col) => { g.fillStyle(0x1a1c2c, 1).fillRect(x - 1, y - 1, wd + 2, 4); g.fillStyle(col, 1).fillRect(x, y, Math.max(0, wd * frac), 2); };
    for (const b of this.w.buildings) {
      const def = BUILDINGS[b.type];
      const x = b.x * TILE + 2, wd = def.w * TILE - 4;
      const top = b.y * TILE - (b.type === 'tower' ? 14 : b.type === 'hall' ? 4 : 2);
      if (!b.done) bar(x, top, wd, b.progress / def.build, 0xffcd75);
      else if (b.hp < def.hp) bar(x, top, wd, b.hp / def.hp, b.hp / def.hp > 0.4 ? 0x38b764 : 0xb13e53);
    }
    for (const e of this.w.enemies) if (e.hp < e.max) bar(e.x * TILE - 6, e.y * TILE - 12, 12, e.hp / e.max, 0xb13e53);
    this.selBox.clear();
    const a = 0.6 + Math.sin(this.time.now / 150) * 0.4;
    const gt = this.buildType && this.ghost.visible && this.ghostTile;
    if (gt) { // footprint of what will be placed: green when it fits, red when it does not
      const col = gt.ok ? 0x38b764 : 0xb13e53;
      this.selBox.fillStyle(col, 0.35).fillRect(gt.x * TILE, gt.y * TILE, gt.w * TILE, gt.h * TILE);
      this.selBox.lineStyle(1, gt.ok ? 0xa7f070 : 0xff8a8a, 0.9).strokeRect(gt.x * TILE + 0.5, gt.y * TILE + 0.5, gt.w * TILE - 1, gt.h * TILE - 1);
    }
    const sel = this.selected && this.w.buildings.find((b) => b.id === this.selected);
    if (sel) { const def = BUILDINGS[sel.type]; this.selBox.lineStyle(1, 0xffcd75, a).strokeRect(sel.x * TILE + 0.5, sel.y * TILE + 0.5, def.w * TILE - 1, def.h * TILE - 1); }
    const v = this.selVillager && this.spr.villagers.get(this.selVillager);
    if (v && v.visible) this.selBox.lineStyle(1, 0xffcd75, a).strokeEllipse(v.x, v.y, 16, 6);
  }

  // colour of the light through the day; returns how much "day" it is (1 day, 0 night)
  updateLight() {
    const w = this.w;
    let col, alpha, dark;
    if (w.night) {
      const t = w.clock - DAY_LEN, k = t > NIGHT_LEN - 6 ? (NIGHT_LEN - t) / 6 : 1;
      col = lerpColor(0xff8a5c, 0x0c1230, k); alpha = 0.22 + 0.36 * k; dark = k;
    } else {
      let i = 0; while (i < LIGHT.length - 2 && w.clock > LIGHT[i + 1][0]) i++;
      const [t0, c0, a0] = LIGHT[i], [t1, c1, a1] = LIGHT[i + 1];
      const k = Math.max(0, Math.min(1, (w.clock - t0) / (t1 - t0)));
      col = lerpColor(c0, c1, k); alpha = a0 + (a1 - a0) * k;
      dark = Math.max(0, (w.clock - (DAY_LEN - WARN_TIME)) / WARN_TIME);
    }
    this.light.setFillStyle(col, 1).setAlpha(alpha);
    for (const o of this.spr.buildings.values()) if (o.glow) o.glow.setAlpha(dark * (0.55 + Math.sin(this.time.now / 300 + o.img.x) * 0.08));
    for (const g of this.lamps || []) g.setAlpha(dark * 0.7);
    return 1 - dark;
  }

  // chimney smoke: more in the morning and evening, drifting with the wind
  emitSmoke() {
    const w = this.w, view = this.cameras.main.worldView;
    const busy = w.clock < 20 || w.clock > 70 || w.night;
    for (const b of w.buildings) {
      if (b.type !== 'house' || !b.done || Math.random() > (busy ? 0.55 : 0.18)) continue;
      const shape = (b.id % 9) % 3; // cottage, cabin, townhouse: each has its chimney elsewhere
      const x = b.x * TILE + [23, 7, 20][shape], y = b.y * TILE + [-7, -7, -12][shape];
      if (!view.contains(x, y)) continue;
      const p = this.acquire('smoke').setPosition(x, y).setDepth(6400).setAlpha(0.75).setScale(0.6);
      this.tweens.add({ targets: p, x: x + 6 + Math.random() * 6, y: y - 16 - Math.random() * 6, scale: 1.5, alpha: 0, duration: 1600 + Math.random() * 600, ease: 'Sine.Out', onComplete: () => this.release(p) });
    }
  }
  siteDust() { // dust kicks up while villagers build
    for (const v of this.w.villagers) {
      if (v.hidden || !v.job || v.job.kind !== 'build' || v.path.length) continue;
      const b = this.w.buildings.find((x) => x.id === v.job.b);
      if (b && !b.done) { const def = BUILDINGS[b.type]; this.dust((b.x + def.w / 2) * TILE + (Math.random() - 0.5) * 10, (b.y + def.h) * TILE - 2, 1); }
    }
  }

  // ---------- juice (pooled images) ----------
  acquire(frame) {
    const p = this.pool.pop() || this.add.image(0, 0, A, frame);
    this.tweens.killTweensOf(p);
    return p.setFrame(frame).setVisible(true).setActive(true).setAlpha(1).setScale(1).setAngle(0).clearTint().setOrigin(0.5);
  }
  release(p) { p.setVisible(false).setActive(false); if (this.pool.length < 260) this.pool.push(p); else p.destroy(); }
  puffs(x, y, n, tint = 0xf4f4f4) {
    for (let k = 0; k < n; k++) {
      const p = this.acquire('puff').setPosition(x, y).setTint(tint).setDepth(6500);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (n > 15 ? 22 : 10);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 6, alpha: 0, scale: 0.4, duration: 400 + Math.random() * 300, ease: 'Quad.Out', onComplete: () => this.release(p) });
    }
  }
  dust(x, y, n) {
    for (let k = 0; k < n; k++) {
      const p = this.acquire('dust').setPosition(x + (Math.random() - 0.5) * 12, y).setDepth(6450);
      this.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 16, y: y - 4 - Math.random() * 8, alpha: 0, duration: 450 + Math.random() * 300, ease: 'Quad.Out', onComplete: () => this.release(p) });
    }
  }
  chips(node, t) { // wood chips, stone bits or leaves fly from what is being worked
    const x = ((node % MAP_W) + 0.5) * TILE, y = (((node / MAP_W) | 0) + 0.6) * TILE;
    const p = this.acquire(t === 'rock' ? 'pebble' : 'dust').setPosition(x, y).setDepth(6450).setTint(t === 'bush' ? 0x38b764 : 0xffffff);
    this.tweens.add({ targets: p, x: x + (Math.random() - 0.5) * 18, y: y - 6, angle: 180, alpha: 0, duration: 350, ease: 'Quad.Out', onComplete: () => this.release(p) });
  }
  gainPop(x, y, res, amt) { // the resource icon bounces up with a pixel "+N"
    const parts = [this.acquire(`ic_${res}`).setScale(amt ? 1.5 : 1)];
    if (amt) for (const ch of '+' + amt) parts.push(this.acquire(`dg_${ch === '+' ? 'p' : ch}`));
    let off = -((parts.length - 1) * 5 + 9) / 2;
    parts.forEach((p, i) => { p.setPosition(Math.round(x + off + (i === 0 ? 4 : 0)), Math.round(y - 8)).setDepth(6600); off += i === 0 ? 11 : 5; });
    for (const p of parts) {
      this.tweens.add({ targets: p, y: p.y - 10, duration: 260, ease: 'Back.Out' });
      this.tweens.add({ targets: p, y: p.y - 18, alpha: 0, delay: 500, duration: 450, ease: 'Quad.In', onComplete: () => this.release(p) });
    }
  }
  shakeNode(i) {
    const s = this.spr.nodes.get(i);
    if (!s || s.isShaking) return;
    s.isShaking = true;
    this.tweens.add({ targets: s, x: s.baseX + 1, duration: 40, yoyo: true, repeat: 1, onComplete: () => { s.x = s.baseX; s.isShaking = false; } });
  }
  leafFall(x, y, tint = 0xffffff) {
    this.leaves = (this.leaves || 0) + 1;
    const p = this.acquire('leaf').setPosition(x + (Math.random() - 0.5) * 14, y).setDepth(6300).setTint(tint);
    this.tweens.add({ targets: p, x: p.x + 14 + Math.random() * 12, y: y + 16 + Math.random() * 6, angle: 200, duration: 1800, ease: 'Sine.InOut',
      onComplete: () => { this.tweens.add({ targets: p, alpha: 0, duration: 500, onComplete: () => { this.release(p); this.leaves--; } }); } });
  }
  flash(id) { const s = this.spr.enemies.get(id); if (s) s.flashUntil = this.time.now + 80; }
}
