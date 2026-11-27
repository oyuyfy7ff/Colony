import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, tick, movePlayer, playerAct, playerRelease, placeBuilding, placeRoad, demolish, setOrder, hall } from '../src/rules/world.js';
import { DAY_LEN, NIGHT_LEN, NODES } from '../src/rules/config.js';
import { parseSave, serializeWorld } from '../src/rules/save.js';

// Every unit in the stock (or in a villager's hands) must have come from somewhere.
export function audit(w) {
  const L = w.ledger, held = { wood: 0, stone: 0, food: 0 };
  for (const v of w.villagers) if (v.carry) held[v.carry.res] += v.carry.amt;
  for (const r of ['wood', 'stone', 'food']) {
    const expect = L.start[r] + L.mined[r] + L.refunded[r] - L.spent[r] + (r === 'food' ? L.farmed - L.eaten : 0);
    assert.equal(w.stock[r] + held[r], expect, `${r}: have ${w.stock[r]}+${held[r]} held, ledger says ${expect}`);
    assert.ok(w.stock[r] >= 0, `${r} went negative`);
  }
}

test('random play for 4 days on 4 maps: no resource is ever duplicated or lost', () => {
  for (const seed of [1, 7, 42, 20261127]) {
    const w = createWorld(seed);
    let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    let mx = 0, my = 0, holding = false;
    for (let t = 0; t < (DAY_LEN + NIGHT_LEN) * 4 && !w.over; t += 1 / 30) {
      if (rnd() < 0.03) { mx = rnd() * 2 - 1; my = rnd() * 2 - 1; }
      if (rnd() < 0.05) { holding = !holding; if (!holding) playerRelease(w); }
      movePlayer(w, mx, my, 1 / 30);
      if (holding) playerAct(w);
      if (rnd() < 0.004) { const h = hall(w); placeBuilding(w, ['house', 'farm', 'tower', 'wall'][(rnd() * 4) | 0], h.x + ((rnd() * 16) | 0) - 8, h.y + ((rnd() * 12) | 0) - 6); }
      if (rnd() < 0.003) placeRoad(w, (w.player.x | 0) + 1, w.player.y | 0);
      if (rnd() < 0.001 && w.buildings.length > 1) demolish(w, w.buildings[1 + ((rnd() * (w.buildings.length - 1)) | 0)].id);
      if (rnd() < 0.002) setOrder(w, 'all', ['auto', 'wood', 'stone', 'food', 'follow'][(rnd() * 5) | 0]);
      tick(w, 1 / 30);
      if (((t * 30) | 0) % 300 === 0) audit(w);
    }
    audit(w);
    // a save and reload keeps the books balanced
    audit(parseSave(serializeWorld(w)).w);
  }
});

test('holding the button works ONE node until it falls; it does not jump to the next by itself', () => {
  const w = createWorld(20261127);
  const k = +Object.keys(w.nodes).find((i) => w.nodes[i].t === 'tree' && (w.nodes[i].grow ?? 2) >= 2);
  w.player.x = (k % 48) + 0.5; w.player.y = ((k / 48) | 0) + 1.5;
  const wood = w.stock.wood;
  for (let i = 0; i < 100; i++) { playerAct(w); w.player.cd = 0; }
  assert.equal(w.nodes[k], undefined, 'the tree fell');
  assert.equal(w.stock.wood - wood, NODES.tree.amt, 'exactly one tree of wood, no more');
  playerRelease(w);
  assert.ok(playerAct(w) === null || w.stock.wood - wood === NODES.tree.amt + 1, 'a new press may start the next one');
});
