// HTML HUD over the canvas (game-ui-ux skill): crisp Thai text at any size, 44px+ touch targets,
// safe-area insets in CSS, updates driven by world events instead of polling every frame,
// modals as a screen stack with focus moved into the top screen and restored on close.
import { BUILDINGS, BUILD_ORDER, DAY_LEN, NIGHT_LEN, ENEMY_NAME } from '../rules/config.js';
import { canAfford, popCap } from '../rules/world.js';
import { iconURL, icon } from '../art/sprites.js';
import { GameAudio } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';

const RES_NAME = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร' };
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
    this.root.innerHTML = `
      <div class="top">
        <div class="chips">
          ${['wood', 'stone', 'food'].map((r) => `<div class="chip" title="${RES_NAME[r]}"><img src="${iconURL(r)}" alt="${RES_NAME[r]}"><b data-res="${r}">0</b></div>`).join('')}
          <div class="chip" title="ประชากร"><img src="${iconURL('pop')}" alt="ประชากร"><b data-pop>0</b></div>
        </div>
        <div class="clock">
          <div class="dayrow"><img class="ic" data-dayicon alt=""><span data-day>วันที่ 1</span><span class="fed" data-fed></span></div>
          <div class="sunbar"><i data-sun></i></div>
          <button class="raid" data-raid title="ศัตรูคืนนี้"></button>
        </div>
        <div class="btns">
          <button class="btn" data-home aria-label="กลับไปที่ศาลากลาง">${icon('home')}</button>
          <button class="btn" data-speed aria-label="ความเร็ว"><img class="ic" data-speedicon src="${iconURL('play')}" alt=""><span data-speedtxt>1x</span></button>
          <button class="btn" data-menu aria-label="เมนู">${icon('menu')}</button>
        </div>
      </div>
      <div class="toasts" data-toasts role="status" aria-live="polite"></div>
      <div class="info hidden" data-info>
        <div><b data-info-name></b> <span data-info-hp></span></div>
        <button class="btn danger" data-demolish>รื้อ (คืนครึ่งหนึ่ง)</button>
      </div>
      <div class="bottom">
        <div class="focus">
          <span>งานหลัก</span>
          ${['auto', 'wood', 'stone', 'food'].map((f) => `<button class="btn sm" data-focus="${f}">${f === 'auto' ? 'อัตโนมัติ' : RES_NAME[f]}</button>`).join('')}
        </div>
        <div class="build">
          ${BUILD_ORDER.map((t) => `
            <button class="bbtn" data-build="${t}">
              <img src="${iconURL(t, 3)}" alt="">
              <span class="nm">${BUILDINGS[t].name}</span>
              <span class="cost">${Object.entries(BUILDINGS[t].cost).map(([k, v]) => `<img src="${iconURL(k, 2)}" alt="${RES_NAME[k]}"><span data-cost="${k}">${v}</span>`).join(' ')}</span>
            </button>`).join('')}
          <button class="bbtn cancel hidden" data-cancel>${icon('close', 'ic big')}<span class="nm">ยกเลิก</span></button>
        </div>
      </div>
      <div class="modal hidden" data-modal role="dialog" aria-modal="true"></div>
    `;
    this.el = {
      res: Object.fromEntries(['wood', 'stone', 'food'].map((r) => [r, $(`[data-res=${r}]`, root)])),
      pop: $('[data-pop]', root), day: $('[data-day]', root), sun: $('[data-sun]', root), fed: $('[data-fed]', root),
      raid: $('[data-raid]', root), speed: $('[data-speed]', root), toasts: $('[data-toasts]', root),
      info: $('[data-info]', root), modal: $('[data-modal]', root), cancel: $('[data-cancel]', root),
    };
    this.bindings();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (this.stack.length && this.stack.at(-1).name !== 'title' && this.stack.at(-1).name !== 'over') this.pop(); else if (!this.stack.length) this.menu(); }
    });
  }

  bindings() {
    const on = (sel, fn) => this.root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.audio.unlock(); fn(b); }));
    on('[data-speed]', () => { const s = this.scene; if (!s) return; s.speed = s.speed >= 3 ? 1 : s.speed + 1; this.sfx('click'); this.clock(true); });
    on('[data-menu]', () => this.menu());
    on('[data-home]', () => { this.scene?.focusHall(); this.sfx('click'); });
    on('[data-raid]', () => { this.scene?.focusSide(this.scene.w.nextSide); this.sfx('click'); });
    on('[data-build]', (b) => {
      const t = b.dataset.build;
      this.scene.setBuild(this.scene.buildType === t ? null : t);
      this.sfx('click');
      if (this.scene.buildType) this.toast(`แตะพื้นที่ว่างเพื่อสร้าง${BUILDINGS[t].name}`, 'info');
      this.refresh();
    });
    on('[data-cancel]', () => { this.scene.setBuild(null); this.refresh(); });
    on('[data-focus]', (b) => { this.scene.w.focus = b.dataset.focus; this.sfx('click'); this.refresh(); });
    on('[data-demolish]', () => { this.scene.demolishSelected(); this.sfx('bad'); this.refresh(); });
    for (const sel of ['.top', '.bottom', '[data-info]', '[data-modal]']) {
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
      case 'gain': case 'built': case 'born': case 'destroyed': case 'placed': this.stocks(); this.refresh(); break;
      case 'day': this.stocks(); this.raidPreview(); this.clock(true); break;
      case 'night': this.raidPreview(); this.clock(true); break;
    }
  }
  stocks() {
    const w = this.scene.w;
    for (const r in this.el.res) {
      const v = String(w.stock[r]);
      if (this.el.res[r].textContent === v) continue;
      this.el.res[r].textContent = v;
      const chip = this.el.res[r].parentElement;
      chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    }
    this.el.pop.textContent = `${w.villagers.length}/${popCap(w)}`;
  }
  // the day clock moves continuously; 4 Hz is plenty (called by the scene)
  clock(force) {
    const s = this.scene; if (!s) return;
    const w = s.w;
    const day = `วันที่ ${w.day}`;
    if (force || this.el.day.textContent !== day) this.el.day.textContent = day;
    const di = w.night ? 'moon' : 'sun';
    if (force || this._di !== di) { this._di = di; this.root.querySelector('[data-dayicon]').src = iconURL(di); }
    this.el.sun.style.width = `${Math.min(100, (w.clock / (DAY_LEN + NIGHT_LEN)) * 100).toFixed(1)}%`;
    this.el.sun.parentElement.classList.toggle('isnight', w.night);
    if (force || this._fed !== w.fed) { this._fed = w.fed; this.el.fed.innerHTML = w.fed ? `${icon('fed')}อิ่ม` : `${icon('hungry')}หิว`; }
    this.el.fed.title = w.fed ? 'ชาวบ้านกินอิ่ม ทำงานเร็วขึ้นวันนี้' : 'อาหารไม่พอมื้อเช้า ทำงานช้ากว่าปกติ';
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
      const t = b.dataset.build;
      b.classList.toggle('active', s.buildType === t);
      const poor = !canAfford(s.w, t);
      b.classList.toggle('poor', poor);
      // not colour alone: the missing cost number turns red AND gets a marker
      b.querySelectorAll('[data-cost]').forEach((c) => c.classList.toggle('short', s.w.stock[c.dataset.cost] < BUILDINGS[t].cost[c.dataset.cost]));
    });
    this.el.cancel.classList.toggle('hidden', !s.buildType);
    this.root.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('active', s.w.focus === b.dataset.focus));
  }

  showInfo(b) {
    const el = this.el.info;
    if (!b) { el.classList.add('hidden'); return; }
    const def = BUILDINGS[b.type];
    $('[data-info-name]', el).textContent = def.name + (b.done ? '' : ' (กำลังสร้าง)');
    $('[data-info-hp]', el).innerHTML = `${icon('heart')}${Math.ceil(b.hp)}/${def.hp}`;
    $('[data-demolish]', el).classList.toggle('hidden', b.type === 'hall');
    el.classList.remove('hidden');
  }

  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
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
    if (!top) { this.el.modal.classList.add('hidden'); this.el.modal.innerHTML = ''; this.clock(true); return; }
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
        <p>${icon('moon')}กลางคืนมอนสเตอร์บุก ดูได้ที่ป้าย "คืนนี้จะมา" ใต้นาฬิกา (แตะเพื่อดูทิศ)</p>
        <p>${icon('tower')}<b>หอธนู</b>ยิงตัวที่ใกล้อาคารที่สุดก่อน <b>กำแพง</b>กันสไลม์และก็อบลิน แต่<b>ค้างคาวบินข้ามได้</b></p>
        <p>${icon('hand')}ลากเลื่อนแผนที่ ถ่างสองนิ้วซูม แตะอาคารเพื่อดูหรือรื้อ</p>
      </div>
      <div class="row">
        <button class="btn big" data-m="resume">เล่นต่อ</button>
        <button class="btn big" data-m="settings">ตั้งค่า</button>
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
