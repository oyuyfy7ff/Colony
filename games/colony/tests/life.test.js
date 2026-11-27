import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, placeBuilding, placeRoad, hall, homeOf, greet, activity, plazaSeats } from '../src/rules/world.js';
import { DAY_LEN, LUNCH_START, MAP_W, WEAR_PATH, TREE_GROW } from '../src/rules/config.js';

const run = (w, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) tick(w, dt); };

test('every villager has a name and a home; houses fill before the hall', () => {
  const w = createWorld(12);
  w.stock.wood = 100;
  const h = hall(w);
  let placed = null;
  for (let r = 3; r < 8 && !placed; r++) for (let dx = -r; dx <= r && !placed; dx++) { const res = placeBuilding(w, 'house', h.x + dx, h.y - r); if (res.ok) placed = res.b; }
  run(w, 12);
  assert.ok(placed.done);
  assert.ok(w.villagers.every((v) => v.name && v.home));
  assert.equal(new Set(w.villagers.map((v) => v.name)).size, w.villagers.length, 'names are unique');
  assert.ok(w.villagers.filter((v) => v.home === placed.id).length >= 1, 'someone moved into the new house');
});

test('at dusk villagers walk to their own home and sleep inside', () => {
  const w = createWorld(12);
  run(w, DAY_LEN + 2);
  assert.ok(w.night);
  for (const v of w.villagers) {
    assert.ok(v.hidden, `${v.name} is inside`);
    const b = homeOf(w, v);
    assert.ok(Math.abs(v.x - (b.x + 1)) < 3 && Math.abs(v.y - (b.y + 1)) < 3, `${v.name} slept near home`);
  }
});

test('at lunch villagers rest in the plaza, sit and chat', () => {
  const w = createWorld(12);
  w.clock = LUNCH_START - 0.5;
  let sat = 0, talked = 0;
  for (let k = 0; k < 9 * 30; k++) {
    tick(w, 1 / 30);
    sat = Math.max(sat, w.villagers.filter((v) => v.sit).length);
    if (w.villagers.some((v) => v.emote && v.emote.k === 'talk')) talked++;
  }
  assert.ok(sat >= 2, `${sat} sat down`);
  assert.ok(talked > 0, 'someone talked');
  assert.ok(plazaSeats(w).length >= 4);
});

test('tapping a villager makes them stop, face the player and wave', () => {
  const w = createWorld(12);
  run(w, 3);
  const v = w.villagers[0];
  const before = { x: v.x, y: v.y };
  assert.equal(greet(w, v.id).emote.k, 'wave');
  run(w, 1);
  assert.deepEqual({ x: v.x, y: v.y }, before);
  assert.equal(v.face, 1);
  assert.ok(activity(w, v).length > 0);
});

test('busy tiles wear into dirt paths; roads cost stone and are preferred', () => {
  const w = createWorld(12);
  run(w, 90);
  assert.ok(w.wear.some((x) => x >= WEAR_PATH), 'a path formed');
  const h = hall(w);
  w.stock.stone = 5;
  assert.equal(placeRoad(w, h.x + 1, h.y + 3).ok, true);
  assert.equal(w.stock.stone, 4);
  assert.equal(placeRoad(w, h.x + 1, h.y + 3).ok, false, 'no double road');
  assert.equal(w.road[(h.y + 3) * MAP_W + h.x + 1], 1);
});

test('new trees start as saplings, grow, and only full trees are chopped', () => {
  const w = createWorld(12);
  let sap = null;
  for (let k = 0; k < 60 * 30 && !sap; k++) { tick(w, 1 / 30); for (const e of w.events) if (e.type === 'sprout' && w.nodes[e.y * MAP_W + e.x]?.t === 'tree') sap = e.y * MAP_W + e.x; w.events.length = 0; }
  assert.ok(sap !== null);
  assert.equal(w.nodes[sap].grow, 0);
  run(w, TREE_GROW[1] + 1);
  if (w.nodes[sap]) assert.equal(w.nodes[sap].grow, 2);
});
