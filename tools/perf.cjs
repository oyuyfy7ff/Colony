// Frame-time check on the production build (performance-optimization skill).
// Stress scene: day 12 spike raid, ~40 villagers, ~45 buildings. Measures the CPU cost of each
// scene update (sim + sync + HUD) because the browser caps rAF at the display rate.
// Needs `npm run build && npx vite preview --port 4173`. Usage: node tools/perf.cjs [budgetMs]
const { chromium, devices } = require('playwright');
(async () => {
  const budget = +(process.argv[2] || 8);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['Pixel 7 landscape'] })).newPage();
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.game?.scene.getScene('play')?.w);
  await page.click('[data-m=start]');
  // place directly through the rules module exposed on the scene's world (deterministic)
  await page.evaluate(() => {
    const s = game.scene.getScene('play'), w = s.w, h = w.buildings.find((b) => b.type === 'hall');
    w.stock.wood = w.stock.stone = w.stock.food = 5000;
    const types = ['tower', 'house', 'wall', 'farm'];
    let n = 0;
    for (let r = 3; r < 10 && n < 45; r++) for (let dx = -r; dx <= r && n < 45; dx++) for (const dy of [-r, r]) {
      const res = colonyRules.placeBuilding(w, types[n % 4], h.x + dx, h.y + dy);
      if (res.ok) { res.b.done = true; res.b.hp = 999; n++; }
    }
    s.setBuild(null);
    for (let k = 0; k < 35; k++) w.villagers.push({ ...w.villagers[0], id: w.nextId++, path: [], job: null });
    w.day = 10; w.nextWave = null; w.clock = 99.9; s.speed = 1;
    // instrument update cost
    // Phaser calls sys.sceneUpdate (bound at boot), so wrap that
    const orig = s.sys.sceneUpdate; window.__ms = [];
    s.sys.sceneUpdate = function (t, d) { const t0 = performance.now(); orig.call(s, t, d); window.__ms.push(performance.now() - t0); };
  });
  console.log('setup', await page.evaluate(() => { const w = game.scene.getScene('play').w; return JSON.stringify({ b: w.buildings.length, over: w.over, night: w.night }); }));
  await page.waitForTimeout(9000); // let the raid arrive
  await page.evaluate(() => { window.__ms = []; });
  await page.waitForTimeout(10000);
  const out = await page.evaluate(() => {
    const ms = window.__ms.slice().sort((a, b) => a - b), w = game.scene.getScene('play').w;
    const q = (p) => ms[Math.floor(ms.length * p)];
    return { frames: ms.length, avg: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +ms.at(-1).toFixed(2),
      enemies: w.enemies.length, villagers: w.villagers.length, buildings: w.buildings.length, fps: Math.round(game.loop.actualFps) };
  });
  console.log(JSON.stringify(out), out.p95 <= budget ? 'PASS' : 'OVER BUDGET', `(budget p95 ${budget} ms)`);
  await browser.close();
  process.exit(out.p95 <= budget ? 0 : 1);
})();
