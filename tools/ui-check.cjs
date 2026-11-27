// Full UI play-check, run before every release. Plays the production build like a player would:
// taps every HUD control, builds, demolishes, survives a night, reloads, loses, starts over,
// and checks phone portrait, desktop and ultrawide. Fails on any page error, emoji in the DOM,
// overlapping HUD panels, small touch targets or a broken step. Screenshots go to out/ui/.
// Needs: npm run build && npx vite preview --port 4173
// Usage: node tools/ui-check.cjs [outDir]
const { chromium, devices } = require('playwright');
const fs = require('fs');

const URL = 'http://localhost:4173/?seed=20261127'; // fixed map so every run checks the same village
const OUT = process.argv[2] || 'out/ui';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let shotN = 0;
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const wait = (p, ms) => p.waitForTimeout(ms);

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.game?.scene.getScene('play')?.w && document.querySelector('[data-modal] .card'));
  await wait(page, 300);
  return { ctx, page };
}
const shot = async (page, name) => { const f = `${OUT}/${String(++shotN).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); return f; };
const W = (page, fn, arg) => page.evaluate(fn, arg);
const modalName = (page) => W(page, () => document.querySelector('[data-modal]').classList.contains('hidden') ? null : document.querySelector('[data-modal] h1, [data-modal] h2')?.textContent);

// Generic layout checks for whatever is on screen now.
async function layoutCheck(page, label) {
  const r = await W(page, () => {
    const emoji = /\p{Extended_Pictographic}/u.test(document.body.innerText);
    const vis = (el) => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const panels = ['.resbar', '.clock', '.btns', '.joy', '.buildwrap', '[data-info]'].map((s) => document.querySelector(s)).filter(vis);
    const rects = panels.map((e) => e.getBoundingClientRect());
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${panels[i].className}/${panels[j].className}`);
    }
    const offscreen = panels.filter((e) => { const b = e.getBoundingClientRect(); return b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1; }).map((e) => e.className);
    const small = [...document.querySelectorAll('#hud button')].filter(vis).filter((b) => { const r = b.getBoundingClientRect(); return r.height < 34 || r.width < 34; }).map((b) => b.dataset ? Object.keys(b.dataset).join(',') || b.className : b.className);
    const tinyText = [...document.querySelectorAll('#hud *')].filter(vis).filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).length;
    // toasts and the info panel must not cover HUD controls
    const ctl = [...document.querySelectorAll('#hud .top button, #hud .bottom button')].filter(vis).map((e) => e.getBoundingClientRect());
    const floaters = [...document.querySelectorAll('.toast, [data-info]')].filter(vis).map((e) => e.getBoundingClientRect());
    const covered = floaters.some((a) => ctl.some((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    return { emoji, overlaps, offscreen, small, tinyText, covered };
  });
  ok(`${label}: no emoji on screen`, !r.emoji);
  ok(`${label}: HUD panels do not overlap`, !r.overlaps.length, r.overlaps.join(' '));
  ok(`${label}: HUD inside the screen`, !r.offscreen.length, r.offscreen.join(' '));
  ok(`${label}: touch targets >= 34px`, !r.small.length, r.small.join(' '));
  ok(`${label}: no text under 11px`, r.tinyText === 0, String(r.tinyText));
  ok(`${label}: toasts and panels do not cover controls`, !r.covered);
}

// Open the build menu and pick a card (the menu closes itself after a pick).
async function pick(page, type) {
  if (await W(page, () => document.querySelector('[data-buildpanel]').classList.contains('hidden') && !document.querySelector('[data-buildmenu]').classList.contains('hidden'))) await page.locator('[data-buildmenu]').tap();
  else if (await W(page, () => !document.querySelector('[data-modechip]').classList.contains('hidden'))) { await page.locator('[data-cancel]').tap(); await page.locator('[data-buildmenu]').tap(); }
  await page.locator(`[data-build=${type}]`).tap();
}
// Screen point of a free tile near the hall that is visible and not covered by HUD.
async function freeTileScreen(page, type) {
  return W(page, (type) => {
    const s = game.scene.getScene('play'), w = s.w, cam = s.cameras.main, h = w.buildings.find((b) => b.type === 'hall');
    const canvas = document.querySelector('#game canvas'), cr = canvas.getBoundingClientRect(), k = cr.width / cam.width;
    for (let r = 2; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = h.x + dx, y = h.y + dy;
      if (!colonyRules.canPlace(w, type, x, y)) continue;
      if (w.villagers.some((v) => (v.x | 0) === x && (v.y | 0) === y)) continue;
      const wx = x * 16 + 8, wy = y * 16 + 8;
      const sx = cr.left + (wx - cam.worldView.x) * cam.zoom * k, sy = cr.top + (wy - cam.worldView.y) * cam.zoom * k;
      if (sx < 10 || sy < 10 || sx > innerWidth - 10 || sy > innerHeight - 10) continue;
      const el = document.elementFromPoint(sx, sy);
      if (el && el.tagName === 'CANVAS') return { sx, sy, x, y };
    }
    return null;
  }, type);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------- phone landscape: the main play-through ----------------
  let { ctx, page } = await open(browser, { ...devices['Pixel 7 landscape'] });
  ok('title screen shows', (await modalName(page)) === 'Pixel Colony');
  ok('title: first button has keyboard focus', await W(page, () => document.activeElement?.dataset?.m === 'start'));
  await shot(page, 'title');
  await layoutCheck(page, 'title');

  await page.locator('[data-m=start]').tap();
  await wait(page, 300);
  ok('start closes the title and unpauses', (await modalName(page)) === null && !(await W(page, () => game.scene.getScene('play').paused)));
  await shot(page, 'hud-day');
  await layoutCheck(page, 'day HUD');

  // build a house through the real UI
  const before = await W(page, () => ({ wood: game.scene.getScene('play').w.stock.wood, n: game.scene.getScene('play').w.buildings.length }));
  await page.locator('[data-buildmenu]').tap();
  ok('build menu opens', await W(page, () => !document.querySelector('[data-buildpanel]').classList.contains('hidden')));
  await wait(page, 400); // let the open animation finish
  await shot(page, 'build-menu');
  await layoutCheck(page, 'build menu open');
  await page.locator('[data-buildmenu]').tap();
  ok('build menu closes again', await W(page, () => document.querySelector('[data-buildpanel]').classList.contains('hidden')));
  await pick(page, 'house');
  await wait(page, 300);
  await layoutCheck(page, 'build mode with hint toast');
  ok('house card enters build mode and shows the mode chip', await W(page, () => game.scene.getScene('play').buildType === 'house' && !document.querySelector('[data-modechip]').classList.contains('hidden') && document.querySelector('[data-buildpanel]').classList.contains('hidden')));
  let t = await freeTileScreen(page, 'house');
  ok('found a free tile on screen', !!t);
  await page.touchscreen.tap(t.sx, t.sy);
  await wait(page, 200);
  const afterHouse = await W(page, () => ({ wood: game.scene.getScene('play').w.stock.wood, n: game.scene.getScene('play').w.buildings.length, chip: document.querySelector('[data-res=wood]').textContent }));
  ok('tap places a house and costs 20 wood', afterHouse.n === before.n + 1 && afterHouse.wood === before.wood - 20, JSON.stringify(afterHouse));
  ok('wood chip updates right away', afterHouse.chip === String(afterHouse.wood));
  await shot(page, 'build-house');

  // tower is unaffordable at the start: the UI must say so
  await pick(page, 'tower');
  ok('unaffordable tower shows a red cost', await W(page, () => !!document.querySelector('[data-build=tower] .short')));
  t = await freeTileScreen(page, 'tower');
  await page.touchscreen.tap(t.sx, t.sy);
  await wait(page, 150);
  await layoutCheck(page, 'with toast');
  ok('placing without resources shows a message', await W(page, () => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes('ทรัพยากรไม่พอ'))));
  await page.locator('[data-cancel]').tap();
  ok('cancel leaves build mode', await W(page, () => game.scene.getScene('play').buildType === null));

  // give resources (stands in for a few minutes of play), then build every type
  await W(page, () => { const w = game.scene.getScene('play').w; w.stock.wood = 200; w.stock.stone = 200; w.stock.food = 80; });
  for (const type of ['farm', 'tower', 'wall']) {
    const n0 = await W(page, () => game.scene.getScene('play').w.buildings.length);
    await pick(page, type);
    const p = await freeTileScreen(page, type);
    await page.touchscreen.tap(p.sx, p.sy);
    await wait(page, 150);
    ok(`build ${type} by tapping`, (await W(page, () => game.scene.getScene('play').w.buildings.length)) === n0 + 1);
  }
  // roads: tap and drag to paint
  await pick(page, 'road');
  const r0 = await W(page, () => ({ n: game.scene.getScene('play').w.road.reduce((a, b) => a + b, 0), stone: game.scene.getScene('play').w.stock.stone }));
  const rt = await freeTileScreen(page, 'wall');
  await page.mouse.move(rt.sx, rt.sy); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(rt.sx + k * 9, rt.sy, { steps: 2 });
  await page.mouse.up();
  await wait(page, 700);
  const r1 = await W(page, () => ({ n: game.scene.getScene('play').w.road.reduce((a, b) => a + b, 0), stone: game.scene.getScene('play').w.stock.stone }));
  ok('dragging paints a road and costs stone', r1.n >= r0.n + 2 && r1.stone === r0.stone - (r1.n - r0.n), JSON.stringify([r0, r1]));
  ok('road shows on the path layer', await W(page, () => game.scene.getScene('play').pathLevel.some((l) => l === 3)));
  await shot(page, 'road');
  await page.locator('[data-cancel]').tap();
  ok('cancel hides the chip and brings back the build button', await W(page, () => document.querySelector('[data-modechip]').classList.contains('hidden') && !document.querySelector('[data-buildmenu]').classList.contains('hidden')));
  await page.locator('[data-speed]').tap(); await page.locator('[data-speed]').tap();
  ok('speed button cycles to 3x', await W(page, () => game.scene.getScene('play').speed === 3 && document.querySelector('[data-speedtxt]').textContent === '3x'));
  await wait(page, 7000);
  ok('villagers finish construction', await W(page, () => game.scene.getScene('play').w.buildings.filter((b) => !b.done).length === 0), await W(page, () => game.scene.getScene('play').w.buildings.map((b) => b.type + (b.done ? '' : '*')).join(',')));
  await page.locator('[data-speed]').tap();
  ok('speed button wraps back to 1x', await W(page, () => game.scene.getScene('play').speed === 1));
  await shot(page, 'village-built');
  // living world is present
  const life = await W(page, () => { const s = game.scene.getScene('play'); return { decor: s.decor.length, bflies: s.critters.bflies.length, sparkles: s.critters.sparkles.length, frames: s.textures.get('A').getFrameNames().length }; });
  ok('decor, butterflies and water sparkles exist', life.decor > 50 && life.bflies > 0 && life.sparkles > 0, JSON.stringify(life));
  // tap a villager: they wave and the card shows their name and what they are doing
  const vp = await W(page, () => {
    const s = game.scene.getScene('play'), cam = s.cameras.main, cr = document.querySelector('#game canvas').getBoundingClientRect(), k = cr.width / cam.width;
    const v = s.w.villagers.find((x) => { if (x.hidden) return false; const sx = cr.left + (x.x * 16 - cam.worldView.x) * cam.zoom * k, sy = cr.top + (x.y * 16 - 2 - cam.worldView.y) * cam.zoom * k; const el = document.elementFromPoint(sx, sy); return el && el.tagName === 'CANVAS'; });
    if (!v) return null;
    game.scene.getScene('play').paused = true; // hold still while we tap
    return { id: v.id, name: v.name, sx: cr.left + (v.x * 16 - cam.worldView.x) * cam.zoom * k, sy: cr.top + (v.y * 16 - 2 - cam.worldView.y) * cam.zoom * k };
  });
  ok('a villager is visible to tap', !!vp);
  if (vp) {
    await page.touchscreen.tap(vp.sx, vp.sy);
    await wait(page, 150);
    ok('tapping a villager shows their name and activity', await W(page, (n) => !document.querySelector('[data-info]').classList.contains('hidden') && document.querySelector('[data-info-name]').textContent === n && document.querySelector('[data-info-hp]').textContent.length > 2, vp.name));
    ok('the villager waves', await W(page, (id) => game.scene.getScene('play').w.villagers.find((v) => v.id === id).emote?.k === 'wave', vp.id));
    await page.locator('[data-who=one][data-order=wood]').tap();
    ok('order ONE villager from their card: only they change', await W(page, (id) => { const w = game.scene.getScene('play').w; return w.villagers.find((v) => v.id === id).order === 'wood' && w.villagers.filter((v) => v.id !== id).every((v) => v.order === 'auto') && document.querySelector('[data-who=one][data-order=wood]').classList.contains('active'); }, vp.id));
    await W(page, () => { game.scene.getScene('play').paused = false; });
    await wait(page, 300);
    await shot(page, 'villager-card');
  }

  // select and demolish the wall
  const wallPt = await W(page, () => {
    const s = game.scene.getScene('play'), cam = s.cameras.main, b = s.w.buildings.find((x) => x.type === 'wall');
    const cr = document.querySelector('#game canvas').getBoundingClientRect(), k = cr.width / cam.width;
    return { sx: cr.left + (b.x * 16 + 8 - cam.worldView.x) * cam.zoom * k, sy: cr.top + (b.y * 16 + 8 - cam.worldView.y) * cam.zoom * k };
  });
  await page.touchscreen.tap(wallPt.sx, wallPt.sy);
  await wait(page, 150);
  ok('tapping a building opens its info panel', await W(page, () => !document.querySelector('[data-info]').classList.contains('hidden') && document.querySelector('[data-info-name]').textContent.includes('กำแพง')));
  await shot(page, 'info-panel');
  await page.locator('[data-demolish]').tap();
  await wait(page, 150);
  ok('demolish removes the wall and closes the panel', await W(page, () => !game.scene.getScene('play').w.buildings.some((b) => b.type === 'wall') && document.querySelector('[data-info]').classList.contains('hidden')));

  // order everyone
  await page.locator('[data-cmdmenu]').tap();
  ok('command menu opens', await W(page, () => !document.querySelector('[data-cmdpanel]').classList.contains('hidden')));
  await wait(page, 400);
  await shot(page, 'command-all');
  await layoutCheck(page, 'command menu');
  await page.locator('[data-who=all][data-order=stone]').tap();
  ok('order ALL villagers: everyone mines stone, menu closes', await W(page, () => game.scene.getScene('play').w.villagers.every((v) => v.order === 'stone') && document.querySelector('[data-cmdpanel]').classList.contains('hidden')));
  await page.locator('[data-cmdmenu]').tap();
  await page.locator('[data-who=all][data-order=auto]').tap();

  // joystick walk + action button chop
  const p0 = await W(page, () => ({ ...game.scene.getScene('play').w.player }));
  const pad = await page.locator('[data-joy]').boundingBox();
  const cx = pad.x + pad.width / 2, cy = pad.y + pad.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + pad.width * 0.4, cy, { steps: 4 });
  await wait(page, 700);
  ok('joystick knob moves while dragging', await W(page, () => document.querySelector('[data-knob]').style.transform.includes('translate')));
  await page.mouse.up();
  const p1 = await W(page, () => ({ ...game.scene.getScene('play').w.player }));
  ok('dragging the joystick right walks the player right', p1.x > p0.x + 0.8, `${p0.x.toFixed(2)} -> ${p1.x.toFixed(2)}`);
  ok('the camera follows the player', await W(page, () => { const s = game.scene.getScene('play'); return s.cameras.main.worldView.contains(s.w.player.x * 16, s.w.player.y * 16); }));
  // stand next to a tree and hold the action button
  await W(page, () => {
    const s = game.scene.getScene('play'), w = s.w;
    for (const k in w.nodes) { const n = w.nodes[k], x = k % 48, y = (k / 48) | 0; if (n.t === 'tree' && (n.grow ?? 2) >= 2 && colonyRules.walkable(w, x, y + 1)) { w.player.x = x + 0.5; w.player.y = y + 1.5; return; } }
  });
  await wait(page, 300);
  ok('action button shows chop when facing a tree', await W(page, () => document.querySelector('[data-acttxt]').textContent === 'ตัดไม้'));
  const wood0 = await W(page, () => game.scene.getScene('play').w.stock.wood);
  const act = await page.locator('[data-act]').boundingBox();
  await page.mouse.move(act.x + act.width / 2, act.y + act.height / 2); await page.mouse.down();
  await wait(page, 1500);
  await shot(page, 'player-chop');
  await page.mouse.up();
  const wood1 = await W(page, () => game.scene.getScene('play').w.stock.wood);
  ok('holding the action button chops wood', wood1 >= wood0 + 3, `${wood0} -> ${wood1}`);
  await layoutCheck(page, 'joystick and action');

  // home and raid buttons move the camera
  ok('day HUD is simple: no raid chip before evening, two top buttons', await W(page, () => document.querySelector('[data-raid]').classList.contains('hidden') && [...document.querySelectorAll('.btns button')].filter((b) => b.offsetParent).length === 2));
  await page.locator('[data-menu]').tap();
  await page.locator('[data-m=home]').tap();
  await wait(page, 1200);
  ok('menu "back to village" brings the player and camera home', await W(page, () => { const s = game.scene.getScene('play'), h = s.w.buildings.find((b) => b.type === 'hall'); return s.cameras.main.worldView.contains((h.x + 1) * 16, (h.y + 1) * 16) && Math.hypot(s.w.player.x - h.x - 1.5, s.w.player.y - h.y - 2.5) < 0.1; }));
  await W(page, () => { game.scene.getScene('play').w.clock = 65; });
  await wait(page, 400);
  ok('raid chip appears as evening nears', await W(page, () => !document.querySelector('[data-raid]').classList.contains('hidden')));
  const before2 = await W(page, () => game.scene.getScene('play').cameras.main.scrollX + ',' + game.scene.getScene('play').cameras.main.scrollY);
  await page.locator('[data-raid]').tap();
  await wait(page, 1200);
  ok('raid button pans toward the raid side', (await W(page, () => game.scene.getScene('play').cameras.main.scrollX + ',' + game.scene.getScene('play').cameras.main.scrollY)) !== before2);

  // menu, settings, focus return
  await page.locator('[data-menu]').tap();
  await wait(page, 150);
  ok('menu opens and pauses the game', (await modalName(page)) === 'พักเกม' && await W(page, () => game.scene.getScene('play').paused));
  await shot(page, 'menu');
  await layoutCheck(page, 'menu');
  await page.locator('[data-m=settings]').tap();
  await wait(page, 150);
  ok('settings screen opens on top', (await modalName(page)) === 'ตั้งค่า');
  await page.locator('input[data-set=music]').fill('40');
  await page.locator('input[data-set=reduceFlash]').check();
  ok('settings are saved', await W(page, () => { const s = JSON.parse(localStorage.getItem('pixel-colony-settings')); return s.music === 0.4 && s.reduceFlash === true; }));
  await shot(page, 'settings');
  await page.locator('[data-m=back]').tap();
  await wait(page, 100);
  ok('back returns to the menu with focus on Settings', (await modalName(page)) === 'พักเกม' && await W(page, () => document.activeElement?.dataset?.m === 'settings'));
  await page.locator('[data-m=resume]').tap();
  ok('resume closes the menu and unpauses', (await modalName(page)) === null && !(await W(page, () => game.scene.getScene('play').paused)));

  // night: warning, raid, defence, dawn
  await W(page, () => { const s = game.scene.getScene('play'); s.w.clock = 83; s.speed = 2; });
  await wait(page, 1500);
  ok('dusk warning toast', await W(page, () => [...document.querySelectorAll('.toast')].some((e) => e.textContent.includes('ใกล้ค่ำ'))));
  // wait for the game clock to reach night (real time varies with machine load)
  await page.waitForFunction(() => game.scene.getScene('play').w.night, null, { timeout: 30000 }).catch(() => {});
  await wait(page, 500);
  ok('night begins with enemies', await W(page, () => { const w = game.scene.getScene('play').w; return w.night && (w.enemies.length + w.spawnQueue.length) > 0; }));
  // wait until the raid reaches the village, keep the hall in frame, then take the picture
  await W(page, () => { const s = game.scene.getScene('play'); s.speed = 1; s.focusHall(); });
  let fighting = false;
  for (let i = 0; i < 60 && !fighting; i++) {
    await wait(page, 500);
    fighting = await W(page, () => {
      const s = game.scene.getScene('play'), w = s.w;
      const near = w.enemies.filter((e) => w.buildings.some((b) => Math.hypot(e.x - b.x - 0.5, e.y - b.y - 0.5) < 6));
      if (near.length) s.camGoal = { x: near[0].x * 16, y: near[0].y * 16 - 20 };
      return near.length > 0 && w.shots.length > 0;
    });
  }
  ok('raid reaches the village and towers shoot', fighting);
  await wait(page, 700);
  await shot(page, 'night-raid');
  await layoutCheck(page, 'night HUD');
  ok('night HUD shows the moon icon and the raid preview', await W(page, () => document.querySelector('[data-dayicon]').src.length > 50 && document.querySelector('[data-raid]').textContent.includes('คืนนี้')));
  ok('frame rate holds during the raid', (await W(page, () => game.loop.actualFps)) >= 50, String(Math.round(await W(page, () => game.loop.actualFps))));
  await W(page, () => { game.scene.getScene('play').speed = 3; });
  await page.waitForFunction(() => !game.scene.getScene('play').w.night, null, { timeout: 40000 });
  const dawn = await W(page, () => { const w = game.scene.getScene('play').w; return { day: w.day, kills: w.stats.kills, over: w.over }; });
  ok('the village survives night 1 and day 2 starts', dawn.day === 2 && !dawn.over, JSON.stringify(dawn));
  ok('towers killed enemies', dawn.kills > 0);
  await wait(page, 300);
  await shot(page, 'dawn');

  // reload: the save must come back
  const saved = await W(page, () => { const w = game.scene.getScene('play').w; return { day: w.day, n: w.buildings.length }; });
  await page.reload();
  await page.waitForFunction(() => window.game?.scene.getScene('play')?.w && document.querySelector('[data-modal] .card'));
  ok('after reload the title offers to continue the saved day', await W(page, (d) => document.querySelector('[data-m=start]').textContent.includes(`วันที่ ${d}`), saved.day));
  await page.locator('[data-m=start]').tap();
  ok('continued game has the same day and buildings', await W(page, (sv) => { const w = game.scene.getScene('play').w; return w.day === sv.day && w.buildings.length === sv.n; }, saved));

  // game over and a fresh start
  await W(page, () => { const w = game.scene.getScene('play').w; w.buildings.find((b) => b.type === 'hall').hp = 0; });
  await wait(page, 400);
  ok('losing the hall shows the game-over screen', (await modalName(page)) === 'ศาลากลางถูกทำลาย');
  await shot(page, 'game-over');
  await layoutCheck(page, 'game over');
  await page.locator('[data-m=new]').tap();
  await wait(page, 800);
  ok('new game starts fresh at day 1 and is playable', await W(page, () => { const s = game.scene.getScene('play'), w = s.w; return w.day === 1 && !w.over && w.buildings.length === 1 && !s.paused; }));
  ok('no page or console errors on the phone run', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ---------------- other screens ----------------
  ({ ctx, page } = await open(browser, { ...devices['Pixel 7'] }));
  ok('portrait phone asks to rotate', await W(page, () => getComputedStyle(document.getElementById('rotate')).display !== 'none'));
  await shot(page, 'portrait');
  await ctx.close();

  for (const [name, opts] of [['iphone-landscape', { ...devices['iPhone 13 landscape'] }], ['desktop', { viewport: { width: 1280, height: 720 } }], ['ultrawide', { viewport: { width: 2560, height: 1080 } }]]) {
    ({ ctx, page } = await open(browser, opts));
    await page.locator('[data-m=start]').click();
    await wait(page, 400);
    await shot(page, name);
    await layoutCheck(page, name);
    ok(`${name}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed, screenshots in ${OUT}`);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('UI CHECK CRASHED:', e.message); process.exit(2); });
