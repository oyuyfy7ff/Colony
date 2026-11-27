// Night raids as data (tower-defense skill): HP grows geometrically, counts grow with progress
// (day and base size, survival-crafting skill), with a spike every 5th night and a breather after.
export const HP_GROWTH = 1.2;
export const HP_GROWTH_LATE = 1.08; // after day 12 the curve flattens so a chill game can run long
export const hpMulFor = (day) => HP_GROWTH ** Math.min(day - 1, 11) * HP_GROWTH_LATE ** Math.max(0, day - 12);

export const ENEMY_INTRO = { slime: 1, goblin: 4, bat: 6 }; // first night each kind appears

export function planNight(day, buildingCount) {
  let base = 2 + Math.floor(day * 1.6) + Math.floor(buildingCount / 8);
  let tag = 'normal';
  if (day % 5 === 0) { tag = 'spike'; base = Math.round(base * 1.4); }
  else if (day > 5 && day % 5 === 1) { tag = 'calm'; base = Math.max(2, Math.round(base * 0.7)); }
  const goblin = day >= ENEMY_INTRO.goblin ? Math.floor(base / 4) + Math.floor((day - ENEMY_INTRO.goblin) / 3) : 0;
  const bat = day >= ENEMY_INTRO.bat ? Math.floor(base / 5) + 1 : 0;
  const slime = Math.max(1, base - goblin - bat);
  const groups = [{ kind: 'slime', count: slime }];
  if (goblin) groups.push({ kind: 'goblin', count: goblin });
  if (bat) groups.push({ kind: 'bat', count: bat });
  const fresh = Object.keys(ENEMY_INTRO).filter((k) => ENEMY_INTRO[k] === day); // telegraph new kinds
  return { day, groups, tag, hpMul: hpMulFor(day), fresh };
}

export const waveTotal = (plan) => plan.groups.reduce((s, g) => s + g.count, 0);
