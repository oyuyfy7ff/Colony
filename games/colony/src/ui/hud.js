// HTML HUD over the canvas (game-ui-ux skill): crisp Thai text at any size, 44px+ touch targets,
// safe-area insets in CSS, updates driven by world events instead of polling every frame,
// modals as a screen stack with focus moved into the top screen and restored on close.
import { BUILDINGS, BUILD_ORDER, DAY_LEN, NIGHT_LEN, ENEMY_NAME, ROAD_INFO } from '../rules/config.js';
import { canAfford, popCap } from '../rules/world.js';
import { iconURL, icon } from '../art/sprites.js';
import { GameAudio } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';

const RES_NAME = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร' };
const ORDER_LIST = [['auto', 'ทำเอง', 'auto'], ['wood', 'ตัดไม้', 'wood'], ['stone', 'ขุดหิน', 'stone'], ['food', 'หาอาหาร', 'food'], ['follow', 'ตามฉัน', 'person']];
const ORDER_BTNS = (who) => ORDER_LIST.map(([o, label, ic]) => `<button class="seg ord" data-order="${o}" data-who="${who}"><img src="${iconURL(ic, 3)}" alt="">${label}</button>`).join('');
const SIDE = ['ตะวันตก', 'ตะวันออก', 'เหนือ', 'ใต้'];
const SIDE_ARROW = ['arrowW', 'arrowE', 'arrowN', 'arrowS'];
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Hud {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.scene = null;
    this.settings = loadSettings();
    this.audio = new GameAudio(this.settings);
    this.stack = []; // screen stack: [{ name, html, focusBack }]
    const card = (t, info) => `
      <button class="bcard" data-build="${t}">
        <img src="${iconURL(t === 'road' ? 'road' : t, 3)}" alt="">
        <span class="nm">${info.name}</span>
        <span class="cost">${Object.entries(info.cost).map(([k, v]) => `<img src="${iconURL(k, 2)}" alt="${RES_NAME[k]}"><span data-cost="${k}">${v}</span>`).join(' ')}</span>
      </button>`;
    this.root.innerHTML = `
      <div class="top">
        <div class="resbar" role="group" aria-label="ทรัพยากร">
          ${['wood', 'stone', 'food'].map((r) => `<div class="res" title="${RES_NAME[r]}"><img src="${iconURL(r)}" alt="${RES_NAME[r]}"><b data-res="${r}">0</b></div>`).join('')}
          <div class="res" title="ประชากร"><img src="${iconURL('pop')}" alt="ประชากร"><b data-pop>0</b></div>
        </div>
        <div class="clock">
          <div class="dayrow"><img class="ic" data-dayicon alt=""><span data-day>วันที่ 1</span></div>
          <div class="sunbar"><i data-sun></i></div>
          <button class="raid" data-raid title="ศัตรูคืนนี้"></button>
        </div>
        <div class="btns">
          <button class="btn sq" data-speed aria-label="ความเร็ว"><img class="ic" data-speedicon src="${iconURL('play')}" alt=""><span data-speedtxt>1x</span></button>
          <button class="btn sq" data-menu aria-label="เมนู">${icon('menu')}</button>
        </div>
      </div>
      <div class="toasts" data-toasts role="status" aria-live="polite"></div>
      <div class="info hidden" data-info>
        <img class="portrait hidden" data-info-pic alt="">
        <div class="infotext"><b data-info-name></b><span data-info-hp></span></div>
        <div class="orders one hidden" data-vorders>${ORDER_BTNS('one')}</div>
        <button class="btn danger" data-demolish>รื้อ (คืนครึ่งหนึ่ง)</button>
      </div>
      <div class="bottom">
        <div class="joy" data-joy aria-label="จอยสติ๊กเดิน"><div class="knob" data-knob></div></div>
        <div class="buildwrap">
          <div class="buildpanel hidden" data-buildpanel role="menu" aria-label="สิ่งก่อสร้าง">
            <div class="ptitle">สร้าง</div>
            <div class="cards">${BUILD_ORDER.map((t) => card(t, BUILDINGS[t])).join('')}${card('road', ROAD_INFO)}</div>
          </div>
          <div class="modechip hidden" data-modechip><img data-modeicon alt=""><span data-modetxt></span><button class="btn sm danger" data-cancel>${icon('close')}ยกเลิก</button></div>
          <div class="cmdpanel hidden" data-cmdpanel role="menu" aria-label="สั่งชาวบ้านทุกคน">
            <div class="ptitle">สั่งชาวบ้านทุกคน</div>
            <div class="orders">${ORDER_BTNS('all')}</div>
          </div>
          <div class="actrow">
            <button class="btn sidebtn" data-cmdmenu aria-expanded="false">${icon('person', 'ic big')}<span>สั่งงาน</span></button>
            <button class="btn sidebtn buildbtn" data-buildmenu aria-expanded="false">${icon('hammer', 'ic big')}<span>สร้าง</span></button>
            <button class="actbtn" data-act aria-label="ทำงาน"><img data-acticon alt=""><span data-acttxt>ทำงาน</span></button>
          </div>
        </div>
      </div>
      <div class="modal hidden" data-modal role="dialog" aria-modal="true"></div>
    `;

    this.el = {
      res: Object.fromEntries(['wood', 'stone', 'food'].map((r) => [r, $(`[data-res=${r}]`, root)])),
      pop: $('[data-pop]', root), day: $('[data-day]', root), sun: $('[data-sun]', root), fed: $('[data-fed]', root),
      raid: $('[data-raid]', root), speed: $('[data-speed]', root), toasts: $('[data-toasts]', root),
      info: $('[data-info]', root), modal: $('[data-modal]', root), cancel: $('[data-cancel]', root),
      panel: $('[data-buildpanel]', root), cmd: $('[data-cmdpanel]', root), menuBtn: $('[data-buildmenu]', root), chip: $('[data-modechip]', root),
    };
    this.bindings();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (this.stack.length && this.stack.at(-1).name !== 'title' && this.stack.at(-1).name !== 'over') this.pop(); else if (!this.stack.length) this.menu(); }
    });
  }

  bindings() {
    const on = (sel, fn) => this.root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.audio.unlock(); fn(b); }));
    on('[data-fs]', () => { this.sfx('click'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen(); });
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement, b = $('[data-fs]', this.root);
      if (!b) return;
      b.classList.toggle('on', fs); b.setAttribute('aria-pressed', String(fs)); b.setAttribute('aria-label', fs ? 'ออกจากเต็มจอ' : 'เต็มจอ');
    });
    on('[data-speed]', () => { const s = this.scene; if (!s) return; s.speed = s.speed >= 3 ? 1 : s.speed + 1; this.sfx('click'); this.clock(true); });
    on('[data-menu]', () => this.menu());
    on('[data-home]', () => { this.scene?.focusHall(); this.sfx('click'); });
    on('[data-raid]', () => { this.scene?.focusSide(this.scene.w.nextSide); this.sfx('click'); });
    on('[data-buildmenu]', () => { this.setPanel(this.el.panel.classList.contains('hidden')); this.sfx('click'); });
    on('[data-build]', (b) => {
      const t = b.dataset.build;
      this.scene.setBuild(t);
      this.setPanel(false);
      this.sfx('click');
      this.toast(t === 'road' ? 'แตะหรือลากบนพื้นเพื่อวางถนน' : `แตะพื้นที่ว่างเพื่อสร้าง${BUILDINGS[t].name}`, 'info');
      this.refresh();
    });
    on('[data-cancel]', () => { this.scene.setBuild(null); this.refresh(); });
    on('[data-cmdmenu]', () => { const open = this.el.cmd.classList.contains('hidden'); this.setPanel(false); this.setCmd(open); this.sfx('click'); });
    on('[data-order]', (b) => {
      const s = this.scene, o = b.dataset.order;
      const n = s.giveOrder(b.dataset.who === 'all' ? 'all' : [s.selVillager], o);
      const label = ORDER_LIST.find((x) => x[0] === o)[1];
      this.toast(b.dataset.who === 'all' ? `สั่งทุกคน (${n} คน): ${label}` : `สั่งแล้ว: ${label}`, 'good');
      this.sfx('place');
      if (b.dataset.who === 'all') this.setCmd(false);
      this.refresh();
    });
    // joystick: drag inside the pad; the knob follows, the vector is read by the scene each frame
    this.joy = { x: 0, y: 0 };
    const pad = this.root.querySelector('[data-joy]'), knob = this.root.querySelector('[data-knob]');
    let jid = null;
    const setJoy = (e) => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const d = Math.hypot(dx, dy), max = R * 0.62;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, d / max), dead = k < 0.15 ? 0 : 1;
      this.joy = { x: d ? (dx / Math.min(d, max)) * k * dead : 0, y: d ? (dy / Math.min(d, max)) * k * dead : 0 };
    };
    pad.addEventListener('pointerdown', (e) => { jid = e.pointerId; pad.setPointerCapture(e.pointerId); pad.classList.add('on'); this.audio.unlock(); setJoy(e); e.stopPropagation(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === jid) setJoy(e); });
    const endJoy = (e) => { if (e.pointerId !== jid) return; jid = null; pad.classList.remove('on'); knob.style.transform = ''; this.joy = { x: 0, y: 0 }; };
    pad.addEventListener('pointerup', endJoy); pad.addEventListener('pointercancel', endJoy);
    // action button: hold to keep working
    const act = this.root.querySelector('[data-act]');
    act.addEventListener('pointerdown', (e) => { this.actHeld = true; act.setPointerCapture(e.pointerId); this.audio.unlock(); e.stopPropagation(); });
    for (const ev of ['pointerup', 'pointercancel']) act.addEventListener(ev, () => { this.actHeld = false; this.scene?.releaseAct(); });
    // keyboard: WASD or arrows to walk, Space or E to work
    this.keys = new Set();
    document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    document.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space' || e.code === 'KeyE') this.scene?.releaseAct(); });
    on('[data-demolish]', () => { this.scene.demolishSelected(); this.sfx('bad'); this.refresh(); });
    // press feedback: a short highlight on every HUD button
    this.root.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed'); } });
    for (const sel of ['.top', '[data-joy]', '.buildwrap', '[data-info]', '[data-modal]']) {
      const el = $(sel, this.root);
      for (const ev of ['pointerdown', 'pointerup', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());
    }
  }

  attach(scene) {
    this.scene = scene;
    this.stack = [];
    this.showInfo(null);
    if (!this._titled) { this._titled = true; this.title(scene.loadInfo); } else this.render();
    this.refresh(); this.stocks(); this.clock(true); this.raidPreview();
  }
  sfx(name) { this.audio.play(name); }

  // ---------- event-driven updates ----------
  onEvent(ev) {
    switch (ev.type) {
      case 'gain': case 'built': case 'born': case 'destroyed': case 'placed': case 'road': this.stocks(); this.refresh(); break;
      case 'day': this.stocks(); this.raidPreview(); this.clock(true); break;
      case 'night': this.raidPreview(); this.clock(true); break;
    }
  }
  stocks() {
    const w = this.scene.w;
    for (const r in this.el.res) {
      const el = this.el.res[r], to = w.stock[r];
      if (el._to === to) continue;
      const from = +el.textContent || 0;
      el._to = to;
      cancelAnimationFrame(el._raf);
      // gains count up smoothly; spending shows at once so the cost is clear
      if (to < from) el.textContent = String(to);
      else {
        const t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / 450); el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1) el._raf = requestAnimationFrame(step); };
        el._raf = requestAnimationFrame(step);
      }
      const chip = el.parentElement;
      chip.classList.remove('bump', 'dip'); void chip.offsetWidth; chip.classList.add(to < from ? 'dip' : 'bump');
    }
    this.el.pop.textContent = `${w.villagers.length}/${popCap(w)}`;
  }
  // the day clock moves continuously; 4 Hz is plenty (called by the scene)
  clock(force) {
    const s = this.scene; if (!s) return;
    const w = s.w;
    const day = `วันที่ ${w.day}`;
    if (force || this.el.day.textContent !== day) {
      if (this.el.day.textContent && this.el.day.textContent !== day) { const row = this.el.day.parentElement; row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump'); }
      this.el.day.textContent = day;
    }
    const di = w.night ? 'moon' : 'sun';
    if (force || this._di !== di) { this._di = di; this.root.querySelector('[data-dayicon]').src = iconURL(di); }
    this.el.sun.style.width = `${Math.min(100, (w.clock / (DAY_LEN + NIGHT_LEN)) * 100).toFixed(1)}%`;
    this.el.sun.parentElement.classList.toggle('isnight', w.night);
    // the raid warning only shows once night is close, so the day screen stays simple
    this.el.raid.classList.toggle('hidden', !(w.night || w.clock >= DAY_LEN - 40));
    const sp = s.paused ? 'pause' : `play${s.speed}`;
    if (force || this._sp !== sp) {
      this._sp = sp;
      this.root.querySelector('[data-speedicon]').src = iconURL(s.paused ? 'pause' : 'play');
      this.root.querySelector('[data-speedtxt]').textContent = s.paused ? 'พัก' : `${s.speed}x`;
    }
  }
  raidPreview() {
    const w = this.scene.w, plan = w.nextWave;
    if (!plan) return;
    const parts = plan.groups.map((g) => `<img src="${iconURL(g.kind, 2)}" alt="${ENEMY_NAME[g.kind]}">${g.count}`).join(' ');
    const tag = plan.tag === 'spike' ? '<span class="tag spike">คืนเดือนแดง</span>' : plan.tag === 'calm' ? '<span class="tag calm">คืนสงบ</span>' : '';
    this.el.raid.innerHTML = `${w.night ? 'คืนนี้' : 'คืนนี้จะมา'} ${parts} <img src="${iconURL(SIDE_ARROW[w.nextSide], 2)}" alt="ทิศ${SIDE[w.nextSide]}"> ${tag}`;
    this.el.raid.setAttribute('aria-label', `ศัตรูคืนนี้ ${plan.groups.map((g) => `${ENEMY_NAME[g.kind]} ${g.count}`).join(' ')} จากทิศ${SIDE[w.nextSide]}`);
  }
  refresh() {
    const s = this.scene; if (!s) return;
    this.stocks();
    this.root.querySelectorAll('[data-build]').forEach((b) => {
      const t = b.dataset.build, cost = t === 'road' ? ROAD_INFO.cost : BUILDINGS[t].cost;
      b.classList.toggle('active', s.buildType === t);
      b.classList.toggle('poor', t === 'road' ? s.w.stock.stone < 1 : !canAfford(s.w, t));
      // not colour alone: the missing cost number turns red AND gets a wavy underline
      b.querySelectorAll('[data-cost]').forEach((c) => c.classList.toggle('short', s.w.stock[c.dataset.cost] < cost[c.dataset.cost]));
    });
    const t = s.buildType;
    this.el.chip.classList.toggle('hidden', !t);
    this.el.menuBtn.classList.toggle('hidden', !!t);
    if (t) {
      const name = t === 'road' ? ROAD_INFO.name : BUILDINGS[t].name;
      $('[data-modeicon]', this.el.chip).src = iconURL(t === 'road' ? 'road' : t, 2);
      $('[data-modetxt]', this.el.chip).textContent = `กำลังวาง${name}`;
    }
    // which order is lit: for "all" when everyone shares it, for the card the selected villager's
    const orders = new Set(s.w.villagers.map((v) => v.order || 'auto'));
    this.root.querySelectorAll('[data-who=all]').forEach((b) => b.classList.toggle('active', orders.size === 1 && orders.has(b.dataset.order)));
    const sv = s.selVillager && s.w.villagers.find((v) => v.id === s.selVillager);
    this.root.querySelectorAll('[data-who=one]').forEach((b) => b.classList.toggle('active', !!sv && (sv.order || 'auto') === b.dataset.order));
  }

  setCmd(open) {
    this.el.cmd.classList.toggle('hidden', !open);
    const t = this.root.querySelector('[data-cmdmenu]');
    t.setAttribute('aria-expanded', String(open)); t.classList.toggle('on', open);
    if (open) this.refresh();
  }
  // the action button shows what it will do: chop, mine, pick or build
  setAction(t) {
    const key = !t ? 'none' : t.kind === 'done' ? 'done' : t.kind === 'build' ? 'build' : t.t;
    if (key === this._act) return;
    this._act = key;
    const [ic, txt] = { tree: ['axe', 'ตัดไม้'], rock: ['stone', 'ขุดหิน'], bush: ['food', 'เก็บผล'], build: ['hammer', 'ซ่อม/สร้าง'], done: ['hand', 'ปล่อยปุ่ม'], none: ['hand', 'ทำงาน'] }[key] || ['hand', 'ทำงาน'];
    this.root.querySelector('[data-acticon]').src = iconURL(ic, 4);
    this.root.querySelector('[data-acttxt]').textContent = txt;
    this.root.querySelector('[data-act]').classList.toggle('ready', key !== 'none');
  }
  setPanel(open) {
    if (open) this.setCmd(false);
    this.el.panel.classList.toggle('hidden', !open);
    this.el.menuBtn.setAttribute('aria-expanded', String(open));
    this.el.menuBtn.classList.toggle('on', open);
    if (open) this.refresh();
  }
  showVillager(v) {
    const el = this.el.info;
    if (!v) { el.classList.add('hidden'); return; }
    const pic = $('[data-info-pic]', el);
    pic.src = iconURL(`vill${v.look}`, 3); pic.classList.remove('hidden');
    $('[data-info-name]', el).textContent = v.name;
    $('[data-info-hp]', el).textContent = v.doing;
    $('[data-demolish]', el).classList.add('hidden');
    $('[data-vorders]', el).classList.remove('hidden');
    this.refresh();
    el.classList.remove('hidden');
  }
  showInfo(b) {
    const el = this.el.info;
    $('[data-info-pic]', el).classList.add('hidden');
    $('[data-vorders]', el).classList.add('hidden');
    if (!b) { el.classList.add('hidden'); return; }
    const def = BUILDINGS[b.type];
    $('[data-info-name]', el).textContent = def.name + (b.done ? '' : ' (กำลังสร้าง)');
    $('[data-info-hp]', el).innerHTML = `${icon('heart')}${Math.ceil(b.hp)}/${def.hp}`;
    $('[data-demolish]', el).classList.toggle('hidden', b.type === 'hall');
    el.classList.remove('hidden');
  }

  toast(text, kind = 'info') {
    // sit just under the clock panel, whatever its height on this screen
    // layout position, not the on-screen box: the clock may still be sliding in
    const c = this.root.querySelector('.clock');
    this.el.toasts.style.top = `${Math.round(c.offsetParent.getBoundingClientRect().top + c.offsetTop + c.offsetHeight + 6)}px`;
    const t = document.createElement('div');
    t.className = `toast t-${kind}`; // prefixed: a bare 'info' class would pick up the info card styles
    t.textContent = text;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  // ---------- screen stack ----------
  push(name, html) {
    // remember what had focus by its data-m key: the screen below is re-rendered on pop
    this.stack.push({ name, html, focusBack: document.activeElement?.dataset?.m || null });
    this.render();
  }
  pop() {
    const top = this.stack.pop();
    this.render();
    if (top && top.focusBack) this.el.modal.querySelector(`[data-m="${top.focusBack}"]`)?.focus({ preventScroll: true });
  }
  replace(name, html) { this.stack.pop(); this.push(name, html); }
  render() {
    const top = this.stack.at(-1);
    if (this.scene) this.scene.paused = !!top || this.scene.w.over;
    if (!top) {
      // the real modal closes at once; a copy fades out on top so closing looks smooth
      if (!this.el.modal.classList.contains('hidden')) {
        const ghost = this.el.modal.cloneNode(true);
        ghost.removeAttribute('data-modal'); ghost.classList.add('closing'); ghost.setAttribute('aria-hidden', 'true');
        ghost.querySelectorAll('[data-m], button, input').forEach((e) => { e.removeAttribute('data-m'); e.tabIndex = -1; });
        this.el.modal.after(ghost);
        setTimeout(() => ghost.remove(), 200);
        this.root.classList.add('intro'); // first close (leaving the title) slides the HUD in
      }
      this.el.modal.classList.add('hidden'); this.el.modal.innerHTML = ''; this.clock(true); return;
    }
    this.el.modal.innerHTML = `<div class="card">${top.html}</div>`;
    this.el.modal.classList.remove('hidden');
    this.wireModal(top.name);
    // move focus into the top screen; Tab stays inside it
    const first = this.el.modal.querySelector('[data-m], input, button');
    first?.focus({ preventScroll: true });
    this.clock(true);
  }
  wireModal() {
    const card = this.el.modal.querySelector('.card');
    const focusables = () => [...card.querySelectorAll('button, input')];
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    card.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      this.audio.unlock();
      const m = b.dataset.m;
      if (m === 'resume' || m === 'start') { if (m === 'start') goFullscreen(); this.stack = []; this.render(); }
      if (m === 'back') this.pop();
      if (m === 'settings') this.push('settings', this.settingsHtml());
      if (m === 'fs') { goFullscreen(); this.stack = []; this.render(); }
      if (m === 'home') { this.stack = []; this.render(); this.scene?.focusHall(); if (this.scene?.w.player) { const h = this.scene.w.buildings.find((b) => b.type === 'hall'); this.scene.w.player.x = h.x + 1.5; this.scene.w.player.y = h.y + 2.5; } }
      if (m === 'new') {
        if (b.dataset.sure || this.scene.w.over) this.game.newGame();
        else { b.dataset.sure = '1'; b.textContent = 'แน่ใจ? แตะอีกครั้ง'; }
      }
    }));
    card.querySelectorAll('input[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
        this.settings[k] = inp.type === 'checkbox' ? inp.checked : inp.value / 100;
        saveSettings(this.settings);
        this.audio.applyVolumes();
        this.scene?.applySettings(this.settings);
        if (k === 'sfx') this.sfx('click');
      });
    });
  }

  menu() {
    if (this.stack.length) return;
    this.push('menu', `
      <h2>พักเกม</h2>
      <div class="help">
        <p>${icon('axe')}ชาวบ้านตัดไม้ ขุดหิน เก็บผลไม้เองอัตโนมัติ มื้อเช้าอิ่มแล้วทำงานเร็วขึ้น</p>
        <p>${icon('house')}<b>บ้าน</b>เพิ่มประชากร <b>ฟาร์ม</b>ผลิตอาหาร</p>
        <p>${icon('moon')}ใกล้ค่ำจะมีป้าย "คืนนี้จะมา" ใต้วันที่ บอกจำนวนศัตรูและทิศ (แตะเพื่อดูทิศ)</p>
        <p>${icon('tower')}<b>หอธนู</b>ยิงตัวที่ใกล้อาคารที่สุดก่อน <b>กำแพง</b>กันสไลม์และก็อบลิน แต่<b>ค้างคาวบินข้ามได้</b></p>
        <p>${icon('hand')}จอยซ้ายล่างเดิน ปุ่มขวาล่างตัดไม้ ขุดหิน เก็บผล (คีย์บอร์ด: WASD กับ Space)</p>
        <p>${icon('person')}แตะชาวบ้านเพื่อสั่งทีละคน หรือกดปุ่ม "สั่งงาน" เพื่อสั่งทุกคน</p>
      </div>
      <div class="row">
        <button class="btn big" data-m="resume">เล่นต่อ</button>
        <button class="btn big" data-m="settings">ตั้งค่า</button>
        <button class="btn big" data-m="home">${icon('home')}กลับหมู่บ้าน</button>
        <button class="btn big" data-m="fs">${icon('full')}เต็มจอ</button>
        <button class="btn big danger" data-m="new">เริ่มใหม่</button>
      </div>`);
  }

  settingsHtml() {
    const s = this.settings;
    const slider = (k, label, ic) => `<label class="set"><span>${icon(ic)}${label}</span><input type="range" min="0" max="100" step="5" data-set="${k}" value="${Math.round(s[k] * 100)}" aria-label="${label}"></label>`;
    return `
      <h2>ตั้งค่า</h2>
      <div class="sets">
        ${slider('music', 'เพลง', 'music')}
        ${slider('sfx', 'เสียงเอฟเฟกต์', 'sound')}
        ${slider('shake', 'จอสั่น', 'shake')}
        <label class="set"><span>${icon('flash')}ลดแสงกะพริบ</span><input type="checkbox" data-set="reduceFlash" ${s.reduceFlash ? 'checked' : ''}></label>
      </div>
      <div class="row"><button class="btn big" data-m="back">กลับ</button></div>`;
  }

  title(info) {
    const has = !!(info && info.w);
    let note = '';
    if (info?.from === 'backup') note = '<p class="note">ไฟล์เซฟล่าสุดเสียหาย จึงโหลดจากเซฟสำรองก่อนหน้าแทน</p>';
    if (info?.error === 'newer') note = '<p class="note">เซฟนี้มาจากเกมเวอร์ชันใหม่กว่า จึงเปิดไม่ได้ (ไม่ได้ลบทิ้ง) ลองรีเฟรชหน้าเพื่ออัปเดตเกม</p>';
    if (info?.error === 'corrupt') note = '<p class="note">เซฟเดิมเสียหาย เริ่มหมู่บ้านใหม่ให้แล้ว</p>';
    this.push('title', `
      <h1>Pixel Colony</h1>
      <p class="sub">สร้างหมู่บ้านเล็กๆ ของคุณ แล้วปกป้องมันในยามค่ำคืน</p>
      ${note}
      <div class="row">
        <button class="btn big" data-m="start">${has ? `เล่นต่อ (วันที่ ${info.w.day})` : 'เริ่มเล่น'}</button>
        ${has ? '<button class="btn big danger" data-m="new">เริ่มใหม่</button>' : ''}
        <button class="btn big" data-m="settings">ตั้งค่า</button>
      </div>`);
  }

  gameOver() {
    const w = this.scene.w;
    this.sfx('over');
    this.stack = [];
    this.push('over', `
      <h2>ศาลากลางถูกทำลาย</h2>
      <p class="sub">หมู่บ้านของคุณอยู่รอดได้ <b>${esc(w.day)}</b> วัน ปราบศัตรู <b>${esc(w.stats.kills)}</b> ตัว ชาวบ้าน <b>${esc(w.villagers.length)}</b> คน</p>
      <div class="row"><button class="btn big" data-m="new">เริ่มหมู่บ้านใหม่</button></div>`);
  }
}

export function goFullscreen() {
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch { /* not supported (iOS Safari) */ }
}
