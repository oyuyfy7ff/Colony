// Play bot: plays the production build through the real on-screen controls (joystick + action
// button + menus) like a person would, and audits the game while it plays. Run before every
// release, together with npm test and tools/ui-check.cjs.
//
// Checks
// - resource books balance at every audit: stock + goods in villagers' hands equals start +
//   mined + farmed + refunds - spending - food eaten (no duplication, nothing vanishes)
// - one hold of the action button yields at most one tree/rock/bush worth of resources
// - a node that runs out is gone from the rules AND from the screen
// - nothing in the stock goes negative; no page errors; the frame rate holds
//
// Needs: npm run build && npx vite preview --port 4173
// Usage: node tools/play-bot.cjs [inGameDays=2] [seed=20261127]
const { chromium, devices } = require('playwright');

const DAYS = +(process.argv[2] || 2), SEED = +(process.argv[3] || 20261127);
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['Pixel 7 landscape'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:4173/?seed=${SEED}`);
  await page.waitForFunction(() => document.querySelector('[data-modal] .card'));
  await page.locator('[data-m=start]').tap();
  await page.waitForTimeout(400);
  await page.evaluate(() => { game.scene.getScene('play').speed = 3; });

  const audit = () => page.evaluate(() => {
    const w = game.scene.getScene('play').w, L = w.ledger, held = { wood: 0, stone: 0, food: 0 };
    for (const v of w.villagers) if (v.carry) held[v.carry.res] += v.carry.amt;
    const bad = [];
    for (const r of ['wood', 'stone', 'food']) {
      const expect = L.start[r] + L.mined[r] + L.refunded[r] - L.spent[r] + (r === 'food' ? L.farmed - L.eaten : 0);
      if (w.stock[r] + held[r] !== expect) bad.push(`${r}: have ${w.stock[r] + held[r]}, books say ${expect}`);
      if (w.stock[r] < 0) bad.push(`${r} negative`);
    }
    return { bad, day: w.day, over: w.over, stock: { ...w.stock } };
  });

  const pad = await page.locator('[data-joy]').boundingBox();
  const jc = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2, r: pad.width * 0.4 };
  const act = await page.locator('[data-act]').boundingBox();
  const ac = { x: act.x + act.width / 2, y: act.y + act.height / 2 };

  // steer with the joystick toward a world point until close (touch-like drag on the pad)
  async function walkTo(tx, ty, maxMs = 6000) {
    const t0 = Date.now();
    await page.mouse.move(jc.x, jc.y); await page.mouse.down();
    while (Date.now() - t0 < maxMs) {
      const p = await page.evaluate(() => { const P = game.scene.getScene('play').w.player; return { x: P.x, y: P.y }; });
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.9) break;
      await page.mouse.move(jc.x + (dx / d) * jc.r, jc.y + (dy / d) * jc.r, { steps: 2 });
      await page.waitForTimeout(120);
    }
    await page.mouse.up();
  }

  let holds = 0, overYield = 0, ghosts = 0, auditsBad = 0, audits = 0;
  const deadline = Date.now() + 1000 * 60 * 4; // hard cap on wall time
  while (Date.now() < deadline) {
    const st = await audit();
    audits++;
    if (st.bad.length) { auditsBad++; console.log('AUDIT', st.bad.join('; ')); }
    if (st.over || st.day > DAYS) break;
    // pick the nearest grown tree / rock / bush and walk next to it
    const target = await page.evaluate(() => {
      const w = game.scene.getScene('play').w, P = w.player;
      let best = null, bd = 1e9;
      for (const k in w.nodes) {
        const n = w.nodes[k]; if (n.amt <= 0 || (n.grow ?? 2) < 2) continue;
        const x = k % 48, y = (k / 48) | 0;
        if (!colonyRules.walkable(w, x, y + 1)) continue;
        const d = Math.hypot(x + 0.5 - P.x, y + 1.5 - P.y);
        if (d < bd) { bd = d; best = { k: +k, x: x + 0.5, y: y + 1.5, t: n.t, amt: n.amt }; }
      }
      return best;
    });
    if (!target) break;
    await walkTo(target.x, target.y);
    // hold the button for a while, longer than the node lasts, then let go
    const before = await page.evaluate(() => ({ ...game.scene.getScene('play').w.ledger.mined }));
    await page.mouse.move(ac.x, ac.y); await page.mouse.down();
    await page.waitForTimeout(3500);
    await page.mouse.up();
    holds++;
    const after = await page.evaluate((k) => {
      const s = game.scene.getScene('play'), w = s.w;
      return { mined: { ...w.ledger.mined }, node: w.nodes[k] ? w.nodes[k].amt : null, sprite: s.spr.nodes.has(k) };
    }, target.k);
    const gained = ['wood', 'stone', 'food'].reduce((a, r) => a + after.mined[r] - before[r], 0);
    // villagers mine too while we hold, so compare only the player's share via the node itself:
    // the node may give at most what it had, and a gone node must be gone on screen too.
    if (after.node === null && after.sprite && target.t !== 'bush') ghosts++;
    if (after.node !== null && after.node > target.amt) overYield++;
    if (holds % 5 === 0) console.log(`hold ${holds}: ${target.t} had ${target.amt}, now ${after.node ?? 'gone'}; mined this hold (all) ${gained}; day ${st.day} stock ${JSON.stringify(st.stock)}`);
    // now and then give orders and build, like a player would
    if (holds % 4 === 0) {
      await page.locator('[data-cmdmenu]').tap();
      await page.locator(`[data-who=all][data-order=${['wood', 'stone', 'food', 'auto'][(holds / 4) % 4]}]`).tap();
    }
    if (holds % 6 === 0) await page.evaluate(() => { const s = game.scene.getScene('play'), w = s.w, h = w.buildings.find((b) => b.type === 'hall'); for (let r = 3; r < 9; r++) for (let dx = -r; dx <= r; dx++) if (colonyRules.placeBuilding(w, 'house', h.x + dx, h.y - r).ok) return; });
  }
  const fin = await audit();
  ok('books balance at every audit (no duplication, nothing lost)', auditsBad === 0 && fin.bad.length === 0, `${audits} audits`);
  ok('a node never gains resources from being worked', overYield === 0);
  ok('a node that runs out disappears from the screen too', ghosts === 0);
  ok('the bot actually played', holds >= 8, `${holds} holds, reached day ${fin.day}`);
  ok('one press works only one node, then the button asks to let go', await page.evaluate(() => {
    const w = game.scene.getScene('play').w;
    const k = +Object.keys(w.nodes).find((i) => w.nodes[i].t === 'tree' && w.nodes[i].amt > 0 && (w.nodes[i].grow ?? 2) >= 2);
    w.player.x = (k % 48) + 0.5; w.player.y = ((k / 48) | 0) + 1.5; w.player.lock = null;
    const start = w.stock.wood, amt = w.nodes[k].amt;
    for (let i = 0; i < 60; i++) { colonyRules.playerAct(w); w.player.cd = 0; }
    return w.stock.wood - start === amt && !w.nodes[k];
  }));
  ok('frame rate holds while playing', (await page.evaluate(() => game.loop.actualFps)) >= 45);
  ok('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} play-bot checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('PLAY BOT CRASHED:', e.message); process.exit(2); });
