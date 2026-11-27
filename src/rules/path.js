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

// Multi-source flow field (game-ai skill: many agents, one goal set -> one Dijkstra/BFS, not A*
// per agent). dist[i] = steps from tile i to the nearest tile that touches a building; -1 = cut off.
export function flowField(passable, isSource) {
  const dist = new Int16Array(MAP_W * MAP_H).fill(-1);
  const queue = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (passable(x, y) && isSource(x, y)) { dist[y * MAP_W + x] = 0; queue.push(y * MAP_W + x); }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % MAP_W, y = (i / MAP_W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (dist[ni] !== -1 || !passable(nx, ny)) continue;
      if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

// Next tile downhill on the field, never cutting a corner. null when already at 0 or stuck.
export function downhill(dist, x, y, passable) {
  const here = dist[y * MAP_W + x];
  let best = null, bd = here < 0 ? 32767 : here;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    const d = dist[ny * MAP_W + nx];
    if (d < 0 || d >= bd) continue;
    if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
    bd = d; best = { x: nx, y: ny };
  }
  return best;
}

// Dijkstra with per-tile entry cost, so villagers prefer roads and worn paths (cheaper tiles).
// Same corner rule and output as bfs (tiles after the start).
export function dijkstra(sx, sy, passable, cost, isGoal) {
  const N = MAP_W * MAP_H, start = sy * MAP_W + sx;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1); // 64-bit: float32 rounding made popped entries look stale
  const heap = [[0, start]];
  dist[start] = 0;
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    if (isGoal(x, y)) {
      const path = [];
      for (let c = i; c !== start; c = prev[c]) path.push({ x: c % MAP_W, y: (c / MAP_W) | 0 });
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || !passable(nx, ny)) continue;
      if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
      const ni = ny * MAP_W + nx, nd = d + cost(nx, ny) * (dx && dy ? 1.414 : 1);
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = i; push([nd, ni]); }
    }
  }
  return null;
}
