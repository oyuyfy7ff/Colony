// Game rules constants. Positions in the rules are in TILE units (floats).
export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 30;

export const DAY_LEN = 100;   // seconds of daylight
export const NIGHT_LEN = 45;  // seconds of night
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
  hall:  { name: 'ศาลากลาง', w: 2, h: 2, hp: 400, cost: {}, build: 0, pop: 3, range: 4.5, dmg: 6, rate: 1.1 },
  house: { name: 'บ้าน', w: 1, h: 1, hp: 80, cost: { wood: 20 }, build: 4, pop: 2 },
  farm:  { name: 'ฟาร์ม', w: 1, h: 1, hp: 50, cost: { wood: 15 }, build: 3, foodEvery: 5 },
  tower: { name: 'หอธนู', w: 1, h: 1, hp: 150, cost: { wood: 15, stone: 15 }, build: 5, range: 5.5, dmg: 8, rate: 0.9 },
  wall:  { name: 'กำแพง', w: 1, h: 1, hp: 200, cost: { stone: 4 }, build: 1.5 },
};
export const BUILD_ORDER = ['house', 'farm', 'tower', 'wall'];
export const ROAD_INFO = { name: 'ถนน', cost: { stone: 1 } }; // painted tile by tile, villagers walk faster on it

export const ENEMIES = {
  slime:  { hp: 22, speed: 1.15, dmg: 5 },
  goblin: { hp: 45, speed: 1.3, dmg: 9 },             // tanky: beats a single weak tower
  bat:    { hp: 14, speed: 1.9, dmg: 4, flying: true },  // flies over walls: beats wall-only bases
};
export const ENEMY_NAME = { slime: 'สไลม์', goblin: 'ก็อบลิน', bat: 'ค้างคาว' };
export const FED_BONUS = 1.25; // buff-model needs: a fed village works faster, nobody starves

export const GROW_EVERY = 20; // seconds between births
export const GROW_FOOD = 10;

// Village life (user feedback: villagers should live a day, not just stand)
export const LUNCH_START = 46;   // seconds into the day: villagers rest and chat in the plaza
export const LUNCH_END = 56;
export const HOUSE_BEDS = 2;     // villagers that live in one house; the hall sleeps 3
export const ROAD_COST = { stone: 1 };
export const ROAD_SPEED = 1.5;   // walking speed on a road
export const PATH_SPEED = 1.15;  // on a worn dirt path
export const WEAR_PATH = 24;     // footsteps before grass wears into a dirt path
export const TREE_GROW = [25, 55]; // seconds for a sapling to become young, then full grown
export const NAMES = ['สมชาย', 'มาลี', 'บุญมี', 'ดาว', 'แก้ว', 'ทองดี', 'จันทร์', 'ปิ่น', 'ก้อง', 'น้ำฝน', 'ใบเตย', 'ภูมิ',
  'ขวัญ', 'ต้นกล้า', 'ฟ้า', 'เมฆ', 'นิด', 'หนึ่ง', 'ส้ม', 'พลอย', 'บัว', 'ข้าวหอม', 'เก่ง', 'อิ่ม'];
