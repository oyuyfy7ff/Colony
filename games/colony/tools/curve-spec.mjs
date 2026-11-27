// Writes tools/waves.json for the tower-defense skill's td_curve_check.py from the real wave plan.
// Run: node tools/curve-spec.mjs && python3 ../../.claude/skills/tower-defense/scripts/td_curve_check.py tools/waves.json
//
// Economy model: "gold" = stone, the tower bottleneck. The bot's stone income is lumpy (villagers
// gather whatever is lowest) and stops when it dies, so the spec uses a steady model, printed next
// to the bot's 3-day average as a sanity check: ~8 spare stone per villager per day, population
// +2.5 a day up to 40. Efficiency 0.15: towers ring the hall but raids come mostly from one side
// (~1/4 engage), times 0.6 for overkill and travel.
import { writeFileSync } from 'node:fs';
import { planNight } from '../src/rules/waves.js';
import { ENEMIES, BUILDINGS } from '../src/rules/config.js';
import { runBot } from './bot.mjs';

const DAYS = 25;
const pop = (d) => Math.min(3 + 2.5 * (d - 1), 40);
const income = (d) => Math.round(8 * pop(d));
const t = BUILDINGS.tower, hl = BUILDINGS.hall;
const hallAsStone = Math.round(((hl.dmg / hl.rate) / (t.dmg / t.rate)) * t.cost.stone);

const { rows } = runBot(8, 1);
const avg = (d) => { const r = rows.slice(Math.max(0, d - 2), d + 1); return Math.round(r.reduce((s, x) => s + x.stoneGathered, 0) / Math.max(1, r.length)); };
console.log('stone/day bot(avg) vs model:', rows.slice(0, 6).map((_, i) => `${avg(i + 1)}/${income(i + 1)}`).join('  '));

const waves = [];
for (let day = 1; day <= DAYS; day++) {
  const plan = planNight(day, 4 + day * 3);
  waves.push({
    groups: plan.groups.map((g) => ({ hp: Math.round(ENEMIES[g.kind].hp * plan.hpMul), count: g.count, speed: ENEMIES[g.kind].speed, spacing: 13.5 / Math.max(1, g.count), bounty: 0 })),
    clear_bonus: income(day + 1), // stone gathered during the next day pays for the next night
  });
}
const spec = { start_gold: 10 + hallAsStone + income(1), tower: { cost: t.cost.stone, dps: +(t.dmg / t.rate).toFixed(2) }, kill_zone: t.range * 2, efficiency: 0.25, waves };
writeFileSync(new URL('./waves.json', import.meta.url), JSON.stringify(spec, null, 1));
console.log('wrote tools/waves.json');
