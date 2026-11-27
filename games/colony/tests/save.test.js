import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, tick } from '../src/rules/world.js';
import { loadFrom, writeTo, parseSave, SAVE_VERSION, SAVE_KEY } from '../src/rules/save.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const run = (w, secs) => { for (let t = 0; t < secs; t += 1 / 30) tick(w, 1 / 30); };

test('round trip: save, change, save again, load the newest', () => {
  const s = mem(), w = createWorld(3);
  run(w, 10);
  assert.ok(writeTo(s, w).ok);
  w.stock.wood = 777;
  writeTo(s, w);
  const r = loadFrom(s);
  assert.equal(r.from, 'primary');
  assert.equal(r.w.stock.wood, 777);
  assert.equal(r.w.v, SAVE_VERSION);
  assert.equal(s.getItem(SAVE_KEY + '.tmp'), null, 'temp key cleaned up');
  run(r.w, 5); // loaded world keeps simulating
});

test('truncated primary falls back to the .bak', () => {
  const s = mem(), w = createWorld(3);
  w.stock.wood = 111; writeTo(s, w);
  w.stock.wood = 222; writeTo(s, w);
  s.setItem(SAVE_KEY, s.getItem(SAVE_KEY).slice(0, 200));
  const r = loadFrom(s);
  assert.equal(r.from, 'backup');
  assert.equal(r.problem, 'corrupt');
  assert.equal(r.w.stock.wood, 111);
});

test('a save from a newer build is refused, not half-loaded', () => {
  const s = mem(), w = createWorld(3);
  writeTo(s, w);
  const d = JSON.parse(s.getItem(SAVE_KEY)); d.v = SAVE_VERSION + 1;
  s.setItem(SAVE_KEY, JSON.stringify(d));
  const r = loadFrom(s);
  assert.equal(r.error, 'newer');
  assert.equal(r.w, undefined);
});

test('shipped v1 fixture migrates through the chain and plays on', () => {
  const r = parseSave(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'));
  assert.ok(r.w, r.error);
  assert.equal(r.w.v, SAVE_VERSION);
  assert.equal(r.w.fed, true);
  assert.ok(r.w.nextWave);
  run(r.w, 60);
  assert.equal(r.w.over, false);
});

test('garbage and missing fields are rejected', () => {
  assert.equal(parseSave('not json').error, 'corrupt');
  assert.equal(parseSave('{"v":2,"terrain":[]}').error, 'corrupt');
  assert.equal(loadFrom(mem()).error, 'none');
});

test('storage full is reported, previous save untouched', () => {
  const s = mem(), w = createWorld(3);
  writeTo(s, w);
  const before = s.getItem(SAVE_KEY);
  s.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  assert.deepEqual(writeTo(s, w), { ok: false, error: 'full' });
  assert.equal(s.getItem(SAVE_KEY), before);
});

test('save is plain data (no functions, no derived caches)', () => {
  const s = mem(), w = createWorld(3);
  run(w, 5);
  writeTo(s, w);
  const json = s.getItem(SAVE_KEY);
  assert.ok(!json.includes('_flow') && !json.includes('"_b"'));
});

test('v3 save: 1x1 houses packed side by side migrate to 2x2 without overlapping (one is refunded)', () => {
  const w = createWorld(5);
  const h = w.buildings[0];
  const d = JSON.parse(JSON.stringify({ ...w, events: [] }));
  d.v = 3;
  // two old 1x1 houses next to each other above the hall: as 2x2 they would overlap
  d.buildings.push({ id: 9001, type: 'house', x: h.x - 3, y: h.y - 4, hp: 80, done: true, progress: 4, cd: 0, prod: 0 });
  d.buildings.push({ id: 9002, type: 'house', x: h.x - 2, y: h.y - 4, hp: 80, done: true, progress: 4, cd: 0, prod: 0 });
  for (const [x, y] of [[h.x - 3, h.y - 4], [h.x - 2, h.y - 4], [h.x - 1, h.y - 4], [h.x - 3, h.y - 3], [h.x - 2, h.y - 3], [h.x - 1, h.y - 3]]) d.terrain[y * 48 + x] = 0;
  const wood = d.stock.wood;
  const r = parseSave(JSON.stringify(d));
  assert.ok(r.w, r.error);
  const houses = r.w.buildings.filter((b) => b.type === 'house');
  assert.equal(houses.length, 1);
  assert.equal(r.w.stock.wood, wood + 20, 'the second house was refunded');
  assert.ok(Object.values(r.w.nodes).filter((n) => n.t === 'tree').every((n) => n.style), 'every tree has a look');
});
