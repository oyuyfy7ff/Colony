import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, movePlayer, playerAct, playerTarget, setOrder, hall, walkable } from '../src/rules/world.js';
import { MAP_W, NODES } from '../src/rules/config.js';

const run = (w, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) tick(w, dt); };

test('the player walks with the joystick and never walks into walls, water or trees', () => {
  const w = createWorld(7);
  const P = w.player, x0 = P.x;
  for (let k = 0; k < 30; k++) movePlayer(w, 1, 0, 1 / 30);
  assert.ok(P.x > x0 + 2, 'moved right');
  for (let k = 0; k < 600; k++) { movePlayer(w, Math.cos(k / 40), Math.sin(k / 23), 1 / 30); assert.ok(walkable(w, P.x | 0, P.y | 0), `inside a solid tile at ${P.x},${P.y}`); }
});

test('the action button chops the tree in front of the player into wood', () => {
  const w = createWorld(7);
  const i = Object.keys(w.nodes).map(Number).find((k) => w.nodes[k].t === 'tree' && (w.nodes[k].grow ?? 2) >= 2 && [[0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => walkable(w, (k % MAP_W) + dx, ((k / MAP_W) | 0) + dy)));
  const x = i % MAP_W, y = (i / MAP_W) | 0;
  const [dx, dy] = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(([a, b]) => walkable(w, x + a, y + b));
  w.player.x = x + dx + 0.5; w.player.y = y + dy + 0.5;
  assert.equal(playerTarget(w).kind, 'node');
  const wood = w.stock.wood;
  for (let k = 0; k < 5; k++) { playerAct(w); tick(w, 0.3); }
  assert.equal(w.stock.wood, wood + 5);
  for (let k = 0; k < NODES.tree.amt; k++) { playerAct(w); w.player.cd = 0; }
  assert.equal(w.nodes[i], undefined, 'the tree is cut down');
});

test('order one villager or everyone; follow keeps them near the player', () => {
  const w = createWorld(7);
  const [a, b] = w.villagers;
  assert.equal(setOrder(w, [a.id], 'stone'), 1);
  assert.equal(a.order, 'stone'); assert.equal(b.order, 'auto');
  run(w, 25);
  assert.ok(!a.job || a.job.kind !== 'gather' || a.job.res === 'stone', 'only mines stone');
  assert.equal(setOrder(w, 'all', 'follow'), w.villagers.length);
  const h = hall(w); w.player.x = h.x + 6.5; w.player.y = h.y + 4.5;
  run(w, 12);
  for (const v of w.villagers) assert.ok(Math.hypot(v.x - w.player.x, v.y - w.player.y) < 3.5, `${v.name} is near the player`);
  setOrder(w, 'all', 'auto');
  assert.ok(w.villagers.every((v) => v.order === 'auto'));
});
