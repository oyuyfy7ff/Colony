// Game rules constants. Positions in the rules are in TILE units (floats).
export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 30;

export const DAY_LEN = 100;   // seconds of daylight
export const NIGHT_LEN = 40;  // seconds of night
export const WARN_TIME = 15;  // villagers head home this long before night

export const T_GRASS = 0;
export const T_WATER = 1;

export const NODES = {
  tree: { gives: 'wood', amt: 25, work: 0.5 },   // seconds per unit
  rock: { gives: 'stone', amt: 30, work: 0.7 },
  bush: { gives: 'food', amt: 12, work: 0.4, regrow: 45 },
};

export const CARRY = 5;
export const VILLAGER_SPEED = 2.4; // tiles / s
export const VILLAGER_HP = 30;

export const BUILDINGS = {
  hall:  { name: 'ศาลากลาง', w: 2, h: 2, hp: 400, cost: {}, build: 0, pop: 3, range: 4.5, dmg: 5, rate: 1.2 },
  house: { name: 'บ้าน', w: 1, h: 1, hp: 80, cost: { wood: 20 }, build: 4, pop: 2 },
  farm:  { name: 'ฟาร์ม', w: 1, h: 1, hp: 50, cost: { wood: 15 }, build: 3, foodEvery: 5 },
  tower: { name: 'หอธนู', w: 1, h: 1, hp: 150, cost: { wood: 15, stone: 15 }, build: 5, range: 5.5, dmg: 8, rate: 0.9 },
  wall:  { name: 'กำแพง', w: 1, h: 1, hp: 200, cost: { stone: 4 }, build: 1.5 },
};
export const BUILD_ORDER = ['house', 'farm', 'tower', 'wall'];

export const ENEMIES = {
  slime:  { hp: 22, speed: 0.9, dmg: 5 },
  goblin: { hp: 45, speed: 1.25, dmg: 9 },
};

export const GROW_EVERY = 14; // seconds between births
export const GROW_FOOD = 8;
