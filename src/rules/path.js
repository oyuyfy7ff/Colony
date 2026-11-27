import { MAP_W, MAP_H } from './config.js';

const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

// Breadth-first search from (sx,sy) to the nearest tile where isGoal(x,y) is true.
// Returns an array of {x,y} tiles (excluding the start) or null. Diagonals never cut corners.
export function bfs(sx, sy, passable, isGoal, maxVisit = MAP_W * MAP_H) {
  const start = sy * MAP_W + sx;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
  prev[start] = -1;
  const queue = [start];
  let head = 0;
  while (head < queue.length && head < maxVisit) {
    const i = queue[head++];
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    if (isGoal(x, y)) {
      const path = [];
      for (let c = i; c !== start; c = prev[c]) path.push({ x: c % MAP_W, y: (c / MAP_W) | 0 });
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (prev[ni] !== -2 || !passable(nx, ny)) continue;
      if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
      prev[ni] = i;
      queue.push(ni);
    }
  }
  return null;
}
