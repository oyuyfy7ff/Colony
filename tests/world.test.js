import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, placeBuilding, serialize, deserialize, popCap, hall } from '../src/rules/world.js';
import { BUILDINGS, DAY_LEN, NIGHT_LEN } from '../src/rules/config.js';

const run = (w, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) tick(w, dt); };

function freeSpotNear(w, type, r0 = 2) {
  const h = hall(w);
  for (let r = r0; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = h.x + dx, y = h.y + dy;
    if (placeBuilding.length && (Math.abs(dx) === r || Math.abs(dy) === r)) {
      const res = placeBuilding(w, type, x, y);
      if (res.ok) return res.b;
    }
  }
  return null;
}

test('world starts with a hall, 3 villagers and resources', () => {
  const w = createWorld(42);
  assert.equal(w.buildings.length, 1);
  assert.equal(w.villagers.length, 3);
  assert.equal(popCap(w), BUILDINGS.hall.pop);
  const kinds = new Set(Object.values(w.nodes).map((n) => n.t));
  assert.ok(kinds.has('tree') && kinds.has('rock') && kinds.has('bush'));
});

test('villagers gather resources during the day', () => {
  const w = createWorld(7);
  const before = w.stock.wood + w.stock.stone + w.stock.food;
  run(w, 40);
  assert.ok(w.stock.wood + w.stock.stone + w.stock.food > before + 10, JSON.stringify(w.stock));
});

test('placing a building costs resources and gets built', () => {
  const w = createWorld(3);
  w.stock.wood = 100;
  const b = freeSpotNear(w, 'house');
  assert.ok(b);
  assert.equal(w.stock.wood, 80);
  run(w, 15);
  assert.ok(b.done, 'house finished');
  assert.equal(popCap(w), 5);
});

test('cannot place on water, nodes or over another building', () => {
  const w = createWorld(3);
  const h = hall(w);
  assert.equal(placeBuilding(w, 'wall', h.x, h.y).ok, false);
});

test('night spawns enemies, defenses kill them, day returns', () => {
  const w = createWorld(11);
  w.stock.wood = 200; w.stock.stone = 200;
  freeSpotNear(w, 'tower'); freeSpotNear(w, 'tower');
  run(w, DAY_LEN + NIGHT_LEN * 0.6);
  assert.ok(w.night);
  assert.ok(w.villagers.every((v) => v.hidden), 'villagers hide at night');
  run(w, NIGHT_LEN);
  assert.equal(w.night, false);
  assert.equal(w.day, 2);
  assert.ok(w.stats.kills > 0, 'some enemies killed');
  assert.equal(w.over, false);
});

test('an idle colony survives the first 3 nights', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = createWorld(seed);
    run(w, (DAY_LEN + NIGHT_LEN) * 3, 1 / 20);
    assert.equal(w.over, false, `seed ${seed}`);
  }
});

test('save and load round-trips', () => {
  const w = createWorld(9);
  run(w, 20);
  const w2 = deserialize(serialize(w));
  assert.deepEqual(w2.stock, w.stock);
  assert.equal(w2.villagers.length, w.villagers.length);
  run(w2, 5);
});
