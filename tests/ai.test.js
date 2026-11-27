import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, placeBuilding, hall, previewNight } from '../src/rules/world.js';
import { DAY_LEN, MAP_W, MAP_H } from '../src/rules/config.js';
import { flowField, downhill, bfs } from '../src/rules/path.js';
import { planNight, waveTotal } from '../src/rules/waves.js';

const run = (w, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) tick(w, dt); };
const toNight = (w) => { w.clock = DAY_LEN - 0.01; tick(w, 0.02); };

test('flow field distance equals BFS path length from many random tiles', () => {
  // game-ai check: the shared field must agree with an exact per-agent search
  const w = createWorld(5);
  const pass = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && w.terrain[y * MAP_W + x] === 0 && !w.nodes[y * MAP_W + x] && !w._b[y * MAP_W + x];
  const h = hall(w);
  const src = (x, y) => x >= h.x - 1 && x <= h.x + 2 && y >= h.y - 1 && y <= h.y + 2 && !(x >= h.x && x < h.x + 2 && y >= h.y && y < h.y + 2);
  const f = flowField(pass, src);
  let checked = 0;
  for (let k = 0; k < 50; k++) {
    const x = (k * 7919) % MAP_W, y = (k * 104729) % MAP_H;
    if (!pass(x, y)) continue;
    const p = bfs(x, y, pass, src);
    assert.equal(f[y * MAP_W + x], p ? p.length : -1, `tile ${x},${y}`);
    checked++;
  }
  assert.ok(checked > 20);
});

test('walking enemies make progress and never stall for 2 s (stuck check)', () => {
  const w = createWorld(21);
  toNight(w);
  run(w, 8);
  const last = new Map();
  for (let step = 0; step < 20 * 30; step++) {
    tick(w, 1 / 30);
    if (step % 60 === 0) {
      for (const e of w.enemies) {
        if (e.kind === 'bat' || e.attacking || e.best === 999) continue; // cut-off spawns give up by design
        const prev = last.get(e.id);
        if (prev) assert.ok(Math.hypot(e.x - prev.x, e.y - prev.y) > 0.5, `enemy ${e.id} stuck near ${e.x.toFixed(1)},${e.y.toFixed(1)}`);
        last.set(e.id, { x: e.x, y: e.y });
      }
    }
  }
});

test('bats fly over a full wall ring; slimes have to break the wall', () => {
  const w = createWorld(8);
  w.stock.stone = 1000;
  const h = hall(w);
  for (let y = h.y - 3; y <= h.y + 4; y++) for (let x = h.x - 3; x <= h.x + 4; x++) {
    if (x === h.x - 3 || x === h.x + 4 || y === h.y - 3 || y === h.y + 4) {
      const r = placeBuilding(w, 'wall', x, y);
      if (r.ok) { r.b.done = true; r.b.hp = 200; }
    }
  }
  w.day = 6; previewNight(w);
  assert.ok(w.nextWave.groups.some((g) => g.kind === 'bat'));
  toNight(w);
  let batInside = false, slimeHitWall = false;
  for (let k = 0; k < 30 * 30; k++) {
    tick(w, 1 / 30);
    for (const e of w.enemies) {
      const inside = e.x > h.x - 3 && e.x < h.x + 4 && e.y > h.y - 3 && e.y < h.y + 4;
      if (e.kind === 'bat' && inside) batInside = true;
      if (e.kind !== 'bat' && e.attacking) slimeHitWall ||= w.buildings.find((b) => b.id === e.target)?.type === 'wall';
    }
  }
  assert.ok(batInside, 'a bat got inside the ring');
  assert.ok(slimeHitWall, 'a walker attacked a wall');
});

test('towers target the enemy closest to reaching a building ("first"), not the closest to the tower', () => {
  const w = createWorld(4);
  w.stock.stone = w.stock.wood = 500;
  const h = hall(w);
  const r = placeBuilding(w, 'tower', h.x + 6, h.y);
  r.b.done = true;
  w.enemies = [
    { id: 900, kind: 'slime', x: h.x + 6.5, y: h.y + 4.5, hp: 50, max: 50, path: [], face: 1, prog: 9, best: 9, stuckT: 0 },
    { id: 901, kind: 'slime', x: h.x + 3.5, y: h.y + 0.5, hp: 50, max: 50, path: [], face: 1, prog: 1, best: 1, stuckT: 0 },
  ];
  w.night = true; w.clock = DAY_LEN + 1;
  tick(w, 0.001);
  const shot = w.shots.find((s) => Math.abs(s.x - (h.x + 6.5)) < 0.1);
  assert.equal(shot.t, 901);
});

test('wave plan: new kinds telegraphed, spike every 5th night, breather after', () => {
  assert.deepEqual(planNight(4, 10).fresh, ['goblin']);
  assert.deepEqual(planNight(6, 10).fresh, ['bat']);
  assert.equal(planNight(10, 10).tag, 'spike');
  assert.equal(planNight(11, 10).tag, 'calm');
  assert.ok(waveTotal(planNight(10, 10)) > waveTotal(planNight(11, 10)));
  assert.ok(planNight(12, 10).hpMul > planNight(11, 10).hpMul);
});

test('breakfast: fed villages work faster, a hungry one just works normally', () => {
  const fed = createWorld(13), hungry = createWorld(13);
  hungry.stock.food = 0;
  for (const w of [fed, hungry]) { w.clock = DAY_LEN + 44.99; w.night = true; tick(w, 0.02); }
  assert.equal(fed.fed, true);
  assert.equal(hungry.fed, false);
  const s0 = (w) => w.stock.wood + w.stock.stone;
  const a = s0(fed), b = s0(hungry);
  run(fed, 40); run(hungry, 40);
  assert.ok(s0(fed) - a > s0(hungry) - b, `fed ${s0(fed) - a} vs hungry ${s0(hungry) - b}`);
});

test('enemies only spawn where they can reach the village, even when their side is cut off', () => {
  // seed 20261127: every walkable tile on the east edge is boxed in by trees and water
  const w = createWorld(20261127);
  w.nextWave = { day: w.day, groups: [{ kind: 'slime', count: 8 }], tag: 'normal', hpMul: 1, fresh: [] };
  w.nextSide = 1;
  toNight(w);
  let fled = 0;
  for (let t = 0; t < 20; t += 1 / 30) { tick(w, 1 / 30); fled += w.events.filter((e) => e.type === 'flee').length; w.events.length = 0; }
  assert.equal(fled, 0, 'no enemy gave up');
  assert.ok(w.stats.kills + w.enemies.length === 8, 'all 8 spawned and are fighting or dead');
});

test('weighted pathfinding finds a route whenever plain BFS does (diagonal costs do not get lost)', async () => {
  const { dijkstra, bfs } = await import('../src/rules/path.js');
  const { walkable } = await import('../src/rules/world.js');
  const w = createWorld(7);
  let n = 0;
  for (let k = 0; k < 60; k++) {
    const sx = (k * 7) % 48, sy = (k * 11) % 30, gx = (k * 13 + 5) % 48, gy = (k * 17 + 3) % 30;
    if (!walkable(w, sx, sy)) continue;
    const goal = (x, y) => Math.hypot(x + 0.5 - gx, y + 0.5 - gy) < 1.6;
    const a = bfs(sx, sy, (x, y) => walkable(w, x, y), goal), b = dijkstra(sx, sy, (x, y) => walkable(w, x, y), () => 1, goal);
    assert.equal(!!b, !!a, `from ${sx},${sy}`); n++;
  }
  assert.ok(n > 20);
});
