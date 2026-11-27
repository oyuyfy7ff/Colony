import Phaser from 'phaser';
import { TILE, MAP_W, MAP_H, BUILDINGS, DAY_LEN, NIGHT_LEN, WARN_TIME } from '../rules/config.js';
import { createWorld, tick, canPlace, canAfford, placeBuilding, demolish, buildingAt } from '../rules/world.js';
import { loadFrom, writeTo, clearFrom } from '../rules/save.js';
import { makeTextures, paintGround } from '../art/sprites.js';
import { TIERS, Trauma, HitStop, approach } from '../feel.js';

const STEP = 1 / 30;
const AUTOSAVE_EVERY = 30; // seconds of daytime; also at every dawn. Never mid-raid.
const store = () => { try { return window.localStorage; } catch { return null; } };

export function loadSave() {
  const s = store();
  return s ? loadFrom(s) : { error: 'none' };
}
export function clearSave() { const s = store(); if (s) clearFrom(s); }

export default class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(data) {
    const loaded = data && data.fresh ? { error: 'none' } : loadSave();
    this.loadInfo = loaded;
    this.saveLocked = loaded.error === 'newer'; // never overwrite a newer build's save
    this.w = loaded.w || createWorld();
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.buildType = null;
    this.selected = null;
    this.saveT = 0;
    this.spr = { nodes: new Map(), buildings: new Map(), villagers: new Map(), enemies: new Map(), shots: new Map() };
    this.trauma = new Trauma();
    this.hitStop = new HitStop();
    this.shakeOff = { x: 0, y: 0 };
    this.camGoal = null;        // smooth pan target (world px) for ⌂ and the raid button
    this.fling = { vx: 0, vy: 0 };
    this.pool = [];             // recycled particle images (performance-optimization: no create/destroy churn)
    this.hudT = 0;
    this.moodT = 0;
  }

  create() {
    makeTextures(this.textures);
    if (this.textures.exists('ground')) this.textures.remove('ground');
    this.textures.addCanvas('ground', paintGround(this.w));
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-1000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setRoundPixels(true);
    const h = this.w.buildings.find((b) => b.type === 'hall');
    cam.centerOn((h.x + 1) * TILE, (h.y + 1) * TILE);
    this.setZoom(this.sys.game.device.input.touch ? 1.5 : 1);

    this.fx = this.add.graphics().setDepth(5000);
    this.ghost = this.add.image(0, 0, 'house').setOrigin(0, 1).setAlpha(0.6).setVisible(false).setDepth(6000);
    this.selBox = this.add.graphics().setDepth(5001);

    this.night = this.add.rectangle(0, 0, 10, 10, 0x0c1230).setOrigin(0).setScrollFactor(0).setDepth(7000).setAlpha(0);
    this.layoutNight();
    this.scale.on('resize', this.layoutNight, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layoutNight, this));

    this.setupInput();

    const save = () => { if (document.hidden && !this.w.night) this.save(); };
    document.addEventListener('visibilitychange', save);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', save));

    this.hud = this.registry.get('hud');
    this.applySettings(this.hud.settings);
    for (let k = 0; k < 60; k++) this.pool.push(this.add.image(0, 0, 'puff').setVisible(false).setActive(false)); // pre-warm
    this.hud.attach(this);
    this.syncAll(0);
  }

  layoutNight() {
    // overlay ignores zoom, so make it large enough for the zoomed-out view
    const cam = this.cameras.main;
    this.night.setPosition(-cam.width, -cam.height).setSize(cam.width * 3, cam.height * 3);
  }

  setZoom(z) {
    const cam = this.cameras.main;
    const minZ = Math.max(cam.width / (MAP_W * TILE), cam.height / (MAP_H * TILE), 1);
    cam.setZoom(Phaser.Math.Clamp(z, minZ, 3));
  }

  // ---------- input: drag to pan, pinch / wheel to zoom, tap to act ----------
  setupInput() {
    this.input.addPointer(1);
    const cam = this.cameras.main;
    let drag = null, pinch = null;
    this.input.on('pointerdown', (p) => {
      const pts = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
      if (pts.length === 2) {
        pinch = { d: Phaser.Math.Distance.BetweenPoints(pts[0].position, pts[1].position), z: cam.zoom };
        drag = null;
        return;
      }
      this.camGoal = null; this.fling.vx = this.fling.vy = 0;
      drag = { x: p.x, y: p.y, sx: cam.scrollX - this.shakeOff.x, sy: cam.scrollY - this.shakeOff.y, moved: false, lx: p.x, ly: p.y, lt: performance.now() };
    });
    this.input.on('pointermove', (p) => {
      if (pinch) {
        const a = this.input.pointer1, b = this.input.pointer2;
        if (a.isDown && b.isDown) this.setZoom(pinch.z * (Phaser.Math.Distance.BetweenPoints(a.position, b.position) / pinch.d));
        return;
      }
      if (this.buildType && !p.isDown) this.moveGhost(p);
      if (!drag || !p.isDown) return;
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) {
        cam.setScroll(drag.sx - dx / cam.zoom + this.shakeOff.x, drag.sy - dy / cam.zoom + this.shakeOff.y);
        const now = performance.now(), dt = Math.max(1, now - drag.lt) / 1000;
        this.fling.vx = -(p.x - drag.lx) / cam.zoom / dt; this.fling.vy = -(p.y - drag.ly) / cam.zoom / dt;
        drag.lx = p.x; drag.ly = p.y; drag.lt = now;
      }
    });
    this.input.on('pointerup', (p) => {
      if (pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) pinch = null; drag = null; return; }
      if (drag && !drag.moved) this.tap(p);
      if (drag && drag.moved && performance.now() - drag.lt > 80) this.fling.vx = this.fling.vy = 0; // held still: no throw
      drag = null;
    });
    this.input.on('wheel', (_p, _o, _dx, dy) => this.setZoom(cam.zoom * (dy > 0 ? 0.9 : 1.1)));
  }

  tileAt(p) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(wp.x / TILE), y: Math.floor(wp.y / TILE) };
  }

  moveGhost(p) {
    const t = this.tileAt(p);
    const ok = canPlace(this.w, this.buildType, t.x, t.y) && canAfford(this.w, this.buildType);
    this.ghost.setPosition(t.x * TILE, (t.y + BUILDINGS[this.buildType].h) * TILE).setVisible(true);
    this.ghost.setTint(ok ? 0xffffff : 0xff5050);
  }

  tap(p) {
    const t = this.tileAt(p);
    if (this.buildType) {
      const res = placeBuilding(this.w, this.buildType, t.x, t.y);
      this.moveGhost(p);
      if (res.ok) {
        this.feedback('small', (t.x + 0.5) * TILE, (t.y + 0.8) * TILE);
        this.hud.sfx('place');
        this.hud.onEvent({ type: 'placed' });
      } else {
        this.hud.toast(res.why === 'cost' ? 'ทรัพยากรไม่พอ' : 'วางตรงนี้ไม่ได้', 'bad');
        this.hud.sfx('bad');
      }
      this.hud.refresh();
      return;
    }
    const b = buildingAt(this.w, t.x, t.y);
    this.select(b ? b.id : null);
  }

  // ---------- commands from the HUD ----------
  setBuild(type) {
    this.buildType = type;
    this.select(null);
    if (type) {
      this.ghost.setTexture(type).setVisible(false);
      const cam = this.cameras.main;
      this.moveGhost({ x: cam.width / 2, y: cam.height / 2 });
    } else this.ghost.setVisible(false);
  }
  focusHall() {
    const h = this.w.buildings.find((b) => b.type === 'hall');
    this.camGoal = { x: (h.x + 1) * TILE, y: (h.y + 1) * TILE };
  }
  focusSide(side) {
    const h = this.w.buildings.find((b) => b.type === 'hall');
    const cx = (h.x + 1) * TILE, cy = (h.y + 1) * TILE, cam = this.cameras.main;
    const dx = cam.width / cam.zoom / 2.5, dy = cam.height / cam.zoom / 2.5;
    this.camGoal = [{ x: cx - dx, y: cy }, { x: cx + dx, y: cy }, { x: cx, y: cy - dy }, { x: cx, y: cy + dy }][side];
  }
  applySettings(s) {
    this.trauma.strength = s.shake;
    this.reduceFlash = s.reduceFlash;
  }
  select(id) { this.selected = id; this.hud.showInfo(id ? this.w.buildings.find((b) => b.id === id) : null); }
  demolishSelected() {
    const b = this.w.buildings.find((x) => x.id === this.selected);
    if (b && demolish(this.w, b.id)) {
      const def = BUILDINGS[b.type];
      this.puffs((b.x + def.w / 2) * TILE, (b.y + def.h) * TILE, 8);
      this.select(null);
    }
  }
  save() {
    const s = store();
    if (!s || this.saveLocked || this.w.over) return;
    const r = writeTo(s, this.w);
    if (!r.ok && !this.saveWarned) { this.saveWarned = true; this.hud.toast(r.error === 'full' ? 'บันทึกไม่ได้: พื้นที่เก็บข้อมูลเต็ม' : 'บันทึกไม่ได้ในเบราว์เซอร์นี้', 'bad'); }
  }

  // ---------- loop ----------
  update(time, deltaMs) {
    const w = this.w;
    const realDt = Math.min(deltaMs / 1000, 0.1);
    if (!this.paused && !w.over) {
      this.acc += realDt * this.speed * this.hitStop.scale(time); // hit-stop slows the sim, not the UI
      while (this.acc >= STEP) { tick(w, STEP); this.acc -= STEP; }
      if (!w.night) {
        this.saveT += deltaMs / 1000;
        if (this.saveT > AUTOSAVE_EVERY) { this.saveT = 0; this.save(); }
      }
    }
    this.handleEvents();
    this.syncAll(deltaMs);
    this.updateCamera(realDt);
    this.hudT += realDt;
    if (this.hudT > 0.25) { this.hudT = 0; this.hud.clock(); }
    this.moodT += realDt;
    if (this.moodT > 0.5) {
      this.moodT = 0;
      const section = w.night ? 'night' : (w.clock > DAY_LEN - WARN_TIME ? 'dusk' : 'day');
      this.hud.audio.setMood(section, Math.min(1, w.enemies.length / 10));
    }
  }

  // camera (camera-systems skill): remove last frame's shake, apply smooth pan / fling, add shake on top
  updateCamera(dt) {
    const cam = this.cameras.main;
    let x = cam.scrollX - this.shakeOff.x, y = cam.scrollY - this.shakeOff.y;
    const halfW = cam.width / 2, halfH = cam.height / 2;
    if (this.camGoal) {
      const gx = this.camGoal.x - halfW, gy = this.camGoal.y - halfH;
      x = approach(x, gx, 7, dt); y = approach(y, gy, 7, dt);
      if (Math.hypot(gx - x, gy - y) < 0.5) this.camGoal = null;
    } else if (Math.abs(this.fling.vx) + Math.abs(this.fling.vy) > 5 && !this.input.activePointer.isDown) {
      x += this.fling.vx * dt; y += this.fling.vy * dt;
      const k = Math.exp(-5 * dt); // frame-rate independent friction
      this.fling.vx *= k; this.fling.vy *= k;
    }
    this.shakeOff = this.trauma.update(dt);
    cam.setScroll(x + this.shakeOff.x, y + this.shakeOff.y); // bounds clamp the view, not the centre
  }

  // one call per event keeps the juice proportional (game-feel tiers)
  feedback(tier, x, y, tint) {
    const T = TIERS[tier];
    this.trauma.add(T.trauma);
    this.hitStop.start(this.time.now, T.stop);
    this.puffs(x, y, T.parts, tint);
  }

  handleEvents() {
    const w = this.w;
    for (const ev of w.events) {
      switch (ev.type) {
        case 'gain': if (ev.amt) this.floatIcon(ev.x * TILE, ev.y * TILE, ev.res); else this.floatIcon(ev.x * TILE, ev.y * TILE, ev.res, true); break;
        case 'hit': this.shakeNode(ev.node); if (this.isOnScreen(ev.node)) this.hud.sfx('chop'); break;
        case 'depleted': this.puffs(((ev.node % MAP_W) + 0.5) * TILE, (((ev.node / MAP_W) | 0) + 0.8) * TILE, 5); break;
        case 'sprout': break;
        case 'die': this.feedback('small', ev.x * TILE, ev.y * TILE, { slime: 0x9a5bd8, goblin: 0x38b764, bat: 0x5d275d }[ev.kind]); this.hud.sfx('kill'); break;
        case 'flee': this.puffs(ev.x * TILE, ev.y * TILE, 4); break;
        case 'hurt': this.flash(ev.id); this.hud.sfx('hit'); break;
        case 'born': this.puffs(ev.x * TILE, ev.y * TILE, 6, 0xffcd75); this.hud.toast('มีชาวบ้านคนใหม่!', 'good'); this.hud.sfx('born'); break;
        case 'built': this.puffs(ev.x * TILE, (ev.y + 1) * TILE, 8); this.hud.sfx('built'); break;
        case 'destroyed': this.feedback('large', ev.x * TILE, ev.y * TILE, 0x566c86); this.hud.sfx('boom'); this.hud.toast(`${BUILDINGS[ev.btype].name}ถูกทำลาย!`, 'bad'); break;
        case 'warn': this.hud.toast('ใกล้ค่ำแล้ว ชาวบ้านกำลังกลับบ้าน', 'warn'); break;
        case 'night': this.hud.toast(`กลางคืน! ศัตรู ${ev.plan.groups.reduce((a, g) => a + g.count, 0)} ตัวมาจากทิศ${['ตะวันตก', 'ตะวันออก', 'เหนือ', 'ใต้'][ev.side]}`, 'bad'); this.hud.sfx('night'); break;
        case 'day': {
          this.hud.toast(`รุ่งเช้า วันที่ ${ev.day} · ${ev.fed ? 'กินอิ่ม ทำงานเร็วขึ้น' : 'อาหารไม่พอ ทำงานช้าลง'}`, ev.fed ? 'good' : 'warn');
          const fresh = ev.plan.fresh.filter((k) => k !== 'slime');
          if (fresh.length) this.hud.toast(fresh.includes('bat') ? 'คืนนี้มีค้างคาว! บินข้ามกำแพงได้ ต้องใช้หอธนู' : 'คืนนี้มีก็อบลิน! ตัวใหญ่ ทนทาน', 'warn');
          if (ev.plan.tag === 'spike') this.hud.toast('คืนนี้คืนเดือนแดง ศัตรูมากกว่าปกติ', 'bad');
          this.hud.sfx('day'); this.save(); break;
        }
        case 'over': this.hud.gameOver(); clearSave(); this.feedback('large', this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, 0xb13e53); break;
      }
    }
    for (const ev of w.events) this.hud.onEvent(ev);
    w.events.length = 0;
  }
  isOnScreen(node) {
    const v = this.cameras.main.worldView;
    return v.contains(((node % MAP_W) + 0.5) * TILE, (((node / MAP_W) | 0) + 0.5) * TILE);
  }

  // ---------- render sync ----------
  syncAll(deltaMs) {
    const w = this.w, now = this.time.now;
    // resource nodes
    const seen = new Set();
    for (const k in w.nodes) {
      const n = w.nodes[k], i = +k;
      seen.add(i);
      let s = this.spr.nodes.get(i);
      const tex = n.t === 'bush' && n.amt <= 0 ? 'bush_empty' : n.t;
      if (!s) {
        s = this.add.image(((i % MAP_W) + 0.5) * TILE, (((i / MAP_W) | 0) + 1) * TILE, tex).setOrigin(0.5, 1);
        s.setDepth(s.y);
        s.baseX = s.x;
        this.spr.nodes.set(i, s);
        s.setScale(0.2); this.tweens.add({ targets: s, scale: 1, duration: 300, ease: 'Back.Out' });
      } else if (s.texture.key !== tex) s.setTexture(tex);
    }
    for (const [i, s] of this.spr.nodes) if (!seen.has(i)) { s.destroy(); this.spr.nodes.delete(i); }

    // buildings
    const bseen = new Set();
    for (const b of w.buildings) {
      bseen.add(b.id);
      const def = BUILDINGS[b.type];
      let o = this.spr.buildings.get(b.id);
      const tex = b.done ? b.type : 'site';
      if (!o) {
        const img = this.add.image((b.x + def.w / 2) * TILE, (b.y + def.h) * TILE, tex).setOrigin(0.5, 1);
        img.setDepth(img.y - 1);
        const glow = def.range || b.type === 'house'
          ? this.add.image(img.x, img.y - def.h * TILE * 0.6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(7001).setScale(b.type === 'hall' ? 2.2 : 1.3).setAlpha(0)
          : null;
        o = { img, glow };
        this.spr.buildings.set(b.id, o);
      }
      if (o.img.texture.key !== tex) {
        o.img.setTexture(tex);
        o.img.setScale(1.15, 0.85);
        this.tweens.add({ targets: o.img, scaleX: 1, scaleY: 1, duration: 250, ease: 'Back.Out' });
      }
      o.img.setTint(b.hitT && w.time - b.hitT < 0.12 && !this.reduceFlash ? 0xff9090 : 0xffffff);
      if (o.glow) o.glow.setVisible(b.done);
    }
    for (const [id, o] of this.spr.buildings) if (!bseen.has(id)) { o.img.destroy(); o.glow?.destroy(); this.spr.buildings.delete(id); }

    // villagers
    this.syncUnits(this.spr.villagers, w.villagers, (v) => `vill${v.look}_`, (v, s) => {
      s.setVisible(!v.hidden);
      if (!s.carry) s.carry = this.add.image(0, 0, 'ic_wood').setOrigin(0.5, 1);
      s.carry.setVisible(!v.hidden && !!v.carry);
      if (v.carry) s.carry.setTexture(`ic_${v.carry.res}`).setPosition(s.x, s.y - 12).setDepth(s.depth + 1);
      const working = v.job && !v.path.length && (v.job.kind === 'gather' || v.job.kind === 'build');
      if (working) s.y -= Math.abs(Math.sin(now / 90)) * 2;
    });

    // enemies
    this.syncUnits(this.spr.enemies, w.enemies, (e) => (e.kind === 'slime' ? 'slime' : `${e.kind}_`), (e, s) => {
      if (e.kind === 'bat') { s.y -= 10 + Math.sin(now / 120 + e.id) * 2; s.setTexture(`bat_${((now / 110) | 0) % 2}`); }
      if (e.kind === 'slime') {
        const t = now / 140 + e.id;
        s.setScale(1 + Math.sin(t) * 0.12, 1 - Math.sin(t) * 0.12);
      }
      if (e.attacking) s.x += Math.sin(now / 50) * 1;
      // reduce-flashing option swaps the white fill flash for a soft red tint
      if (s.flashUntil > now) { if (this.reduceFlash) s.setTint(0xff9090).setTintMode(Phaser.TintModes.MULTIPLY); else s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); }
      else s.setTint(0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    });

    // arrows
    const sseen = new Set();
    for (const sh of w.shots) {
      sseen.add(sh.id);
      let s = this.spr.shots.get(sh.id);
      if (!s) { s = this.add.image(0, 0, 'arrow').setDepth(4000); this.spr.shots.set(sh.id, s); }
      s.setPosition(sh.x * TILE, sh.y * TILE).setRotation(sh.a || 0);
    }
    for (const [id, s] of this.spr.shots) if (!sseen.has(id)) { s.destroy(); this.spr.shots.delete(id); }

    this.drawBars();
    this.updateLight();
  }

  syncUnits(map, list, texOf, extra) {
    const seen = new Set();
    const now = this.time.now;
    for (const u of list) {
      seen.add(u.id);
      let s = map.get(u.id);
      const base = texOf(u);
      const animated = base.endsWith('_');
      if (!s) {
        s = this.add.image(u.x * TILE, u.y * TILE, animated ? base + '0' : base).setOrigin(0.5, 1);
        s.shadow = this.add.image(0, 0, 'shadow');
        s.lastX = u.x; s.lastY = u.y;
        map.set(u.id, s);
      }
      const moving = Math.abs(u.x - s.lastX) + Math.abs(u.y - s.lastY) > 0.0005;
      s.lastX = u.x; s.lastY = u.y;
      if (animated) s.setTexture(base + (moving ? ((now / 150) | 0) % 2 : 0));
      s.setPosition(Math.round(u.x * TILE), Math.round(u.y * TILE + 5));
      s.setFlipX(u.face < 0);
      s.setDepth(s.y);
      s.shadow.setPosition(s.x, s.y).setDepth(s.y - 0.5);
      extra(u, s);
      s.shadow.setVisible(s.visible);
    }
    for (const [id, s] of map) if (!seen.has(id)) { s.shadow.destroy(); s.carry?.destroy(); s.destroy(); map.delete(id); }
  }

  drawBars() {
    const g = this.fx;
    g.clear();
    const bar = (x, y, wd, frac, col) => {
      g.fillStyle(0x1a1c2c, 1).fillRect(x - 1, y - 1, wd + 2, 4);
      g.fillStyle(col, 1).fillRect(x, y, Math.max(0, wd * frac), 2);
    };
    for (const b of this.w.buildings) {
      const def = BUILDINGS[b.type];
      const x = b.x * TILE + 2, wd = def.w * TILE - 4;
      const top = b.y * TILE - (b.type === 'tower' ? 14 : b.type === 'hall' ? 4 : 2);
      if (!b.done) bar(x, top, wd, b.progress / def.build, 0xffcd75);
      else if (b.hp < def.hp) bar(x, top, wd, b.hp / def.hp, b.hp / def.hp > 0.4 ? 0x38b764 : 0xb13e53);
    }
    for (const e of this.w.enemies) if (e.hp < e.max) bar(e.x * TILE - 6, e.y * TILE - 12, 12, e.hp / e.max, 0xb13e53);
    this.selBox.clear();
    const sel = this.selected && this.w.buildings.find((b) => b.id === this.selected);
    if (sel) {
      const def = BUILDINGS[sel.type];
      const a = 0.6 + Math.sin(this.time.now / 150) * 0.4;
      this.selBox.lineStyle(1, 0xffcd75, a).strokeRect(sel.x * TILE + 0.5, sel.y * TILE + 0.5, def.w * TILE - 1, def.h * TILE - 1);
    }
  }

  updateLight() {
    const w = this.w;
    let dark;
    if (w.night) {
      const t = w.clock - DAY_LEN;
      dark = t > NIGHT_LEN - 6 ? (NIGHT_LEN - t) / 6 : 1;
    } else if (w.clock > DAY_LEN - WARN_TIME) dark = (w.clock - (DAY_LEN - WARN_TIME)) / WARN_TIME;
    else dark = 0;
    this.night.setAlpha(dark * 0.55);
    for (const o of this.spr.buildings.values()) if (o.glow) o.glow.setAlpha(dark * (0.55 + Math.sin(this.time.now / 300 + o.img.x) * 0.08));
  }

  // ---------- juice ----------
  acquire(tex) {
    const p = this.pool.pop() || this.add.image(0, 0, tex);
    return p.setTexture(tex).setVisible(true).setActive(true).setAlpha(1).setScale(1).clearTint();
  }
  release(p) { p.setVisible(false).setActive(false); if (this.pool.length < 200) this.pool.push(p); else p.destroy(); }
  puffs(x, y, n, tint = 0xf4f4f4) {
    for (let k = 0; k < n; k++) {
      const p = this.acquire('puff').setPosition(x, y).setTint(tint).setDepth(6500);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (n > 15 ? 22 : 10);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 6, alpha: 0, scale: 0.4, duration: 400 + Math.random() * 300, ease: 'Quad.Out', onComplete: () => this.release(p) });
    }
  }
  floatIcon(x, y, res, small) {
    const ic = this.acquire(`ic_${res}`).setPosition(x, y - 8).setDepth(6600).setScale(small ? 1 : 1.5);
    this.tweens.add({ targets: ic, y: y - 22, alpha: 0, duration: 900, ease: 'Quad.Out', onComplete: () => this.release(ic) });
  }
  shakeNode(i) {
    const s = this.spr.nodes.get(i);
    if (!s || s.isShaking) return;
    s.isShaking = true;
    this.tweens.add({ targets: s, x: s.baseX + 1, duration: 40, yoyo: true, repeat: 1, onComplete: () => { s.x = s.baseX; s.isShaking = false; } });
  }
  flash(id) { const s = this.spr.enemies.get(id); if (s) s.flashUntil = this.time.now + 80; }
}
