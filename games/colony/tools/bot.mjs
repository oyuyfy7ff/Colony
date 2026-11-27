// Headless "reasonable player": builds houses, farms and towers around the hall as stock allows.
// Prints per-night pressure facts. Usage: node tools/bot.mjs [days] [seed]
import { createWorld, tick, placeBuilding, hall, popCap, canAfford } from '../src/rules/world.js';
import { DAY_LEN, NIGHT_LEN } from '../src/rules/config.js';

export function runBot(days = 15, seed = 1, log = false) {
  const w = createWorld(seed);
  const h = hall(w);
  const ring = [];
  for (let r = 2; r < 9; r++) for (let dy = -r; dy <= r + 1; dy++) for (let dx = -r; dx <= r + 1; dx++)
    if (Math.max(Math.abs(dx - 0.5), Math.abs(dy - 0.5)) > r - 0.6) ring.push([h.x + dx, h.y + dy, r]);
  const tryPlace = (type, maxR) => { for (const [x, y, r] of ring) if (r <= maxR && placeBuilding(w, type, x, y).ok) return true; return false; };
  const rows = [];
  let lastDay = w.day, gathered = 0, hpAtDusk = 0;
  for (let t = 0; t < (DAY_LEN + NIGHT_LEN) * days && !w.over; t += 1 / 20) {
    if (!w.night && ((t * 20) | 0) % 40 === 0) {
      const towers = w.buildings.filter((b) => b.type === 'tower').length;
      if (towers < 2 + w.day && canAfford(w, 'tower')) tryPlace('tower', 4);
      else if (w.villagers.length >= popCap(w) && canAfford(w, 'house')) tryPlace('house', 7);
      else if (w.buildings.filter((b) => b.type === 'farm').length < w.villagers.length / 3 && canAfford(w, 'farm')) tryPlace('farm', 7);
    }
    const wasNight = w.night;
    tick(w, 1 / 20);
    for (const e of w.events) if (e.type === 'gain' && e.res === 'stone') gathered += e.amt || 0;
    w.events.length = 0;
    if (!wasNight && w.night) hpAtDusk = w.buildings.reduce((s, b) => s + b.hp, 0);
    if (w.day !== lastDay) {
      const hpNow = w.buildings.reduce((s, b) => s + b.hp, 0);
      rows.push({ night: lastDay, pop: w.villagers.length, towers: w.buildings.filter((b) => b.type === 'tower').length,
        stoneGathered: gathered, hpLost: Math.max(0, Math.round(hpAtDusk - hpNow)), kills: w.stats.kills });
      lastDay = w.day; gathered = 0;
    }
  }
  if (log) console.table(rows);
  return { w, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { w } = runBot(+process.argv[2] || 15, +process.argv[3] || 1, true);
  console.log('survived to day', w.day, 'over:', w.over, 'pop', w.villagers.length, 'kills', w.stats.kills);
}
