// HTML HUD over the canvas: crisp Thai text at any screen size, big touch targets.
import { BUILDINGS, BUILD_ORDER, DAY_LEN, NIGHT_LEN } from '../rules/config.js';
import { canAfford, popCap } from '../rules/world.js';
import { iconURL } from '../art/sprites.js';
import { Sfx } from './sfx.js';

const RES_NAME = { wood: 'ไม้', stone: 'หิน', food: 'อาหาร' };
const $ = (sel, root = document) => root.querySelector(sel);

export class Hud {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.scene = null;
    this.sound = new Sfx();
    this.root.innerHTML = `
      <div class="top">
        <div class="chips">
          ${['wood', 'stone', 'food'].map((r) => `<div class="chip" title="${RES_NAME[r]}"><img src="${iconURL(r)}"><b data-res="${r}">0</b></div>`).join('')}
          <div class="chip" title="ประชากร"><img src="${iconURL('pop')}"><b data-pop>0</b></div>
        </div>
        <div class="clock"><span data-day>วันที่ 1</span><div class="sunbar"><i data-sun></i></div></div>
        <div class="btns">
          <button class="btn" data-speed>▶ 1x</button>
          <button class="btn" data-menu>☰</button>
        </div>
      </div>
      <div class="toasts" data-toasts></div>
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
              <img src="${iconURL(t, 3)}">
              <span class="nm">${BUILDINGS[t].name}</span>
              <span class="cost">${Object.entries(BUILDINGS[t].cost).map(([k, v]) => `<img src="${iconURL(k, 2)}">${v}`).join(' ')}</span>
            </button>`).join('')}
          <button class="bbtn cancel hidden" data-cancel>✕<span class="nm">ยกเลิก</span></button>
        </div>
      </div>
      <div class="modal hidden" data-modal></div>
    `;
    this.el = {
      res: Object.fromEntries(['wood', 'stone', 'food'].map((r) => [r, $(`[data-res=${r}]`, root)])),
      pop: $('[data-pop]', root), day: $('[data-day]', root), sun: $('[data-sun]', root),
      speed: $('[data-speed]', root), toasts: $('[data-toasts]', root), info: $('[data-info]', root),
      modal: $('[data-modal]', root), cancel: $('[data-cancel]', root),
    };
    this.bindings();
  }

  bindings() {
    const on = (sel, fn) => this.root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.sound.unlock(); fn(b); }));
    on('[data-speed]', () => {
      const s = this.scene; if (!s) return;
      s.speed = s.speed >= 3 ? 1 : s.speed + 1;
      this.sfx('click');
    });
    on('[data-menu]', () => this.menu());
    on('[data-build]', (b) => {
      const t = b.dataset.build;
      this.scene.setBuild(this.scene.buildType === t ? null : t);
      this.sfx('click');
      if (this.scene.buildType) this.toast(`แตะพื้นที่ว่างเพื่อสร้าง${BUILDINGS[t].name}`, 'info');
      this.refresh();
    });
    on('[data-cancel]', () => { this.scene.setBuild(null); this.refresh(); });
    on('[data-focus]', (b) => { this.scene.w.focus = b.dataset.focus; this.sfx('click'); this.refresh(); });
    on('[data-demolish]', () => { this.scene.demolishSelected(); this.sfx('bad'); });
    // keep canvas from getting taps that land on HUD panels
    for (const sel of ['.top', '.bottom', '[data-info]', '[data-modal]']) {
      const el = $(sel, this.root);
      for (const ev of ['pointerdown', 'pointerup', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());
    }
  }

  attach(scene) {
    this.scene = scene;
    this.showInfo(null);
    if (!this._titled) { this._titled = true; this.title(scene.registry.get('hadSave')); } else this.closeModal();
    this.refresh();
  }
  sfx(name) { this.sound.play(name); }

  refresh() {
    const s = this.scene; if (!s) return;
    this.root.querySelectorAll('[data-build]').forEach((b) => {
      b.classList.toggle('active', s.buildType === b.dataset.build);
      b.classList.toggle('poor', !canAfford(s.w, b.dataset.build));
    });
    this.el.cancel.classList.toggle('hidden', !s.buildType);
    this.root.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('active', s.w.focus === b.dataset.focus));
  }

  update() {
    const s = this.scene; if (!s) return;
    const w = s.w;
    for (const r in this.el.res) {
      const v = String(w.stock[r]);
      if (this.el.res[r].textContent !== v) {
        this.el.res[r].textContent = v;
        this.el.res[r].parentElement.classList.remove('bump'); void this.el.res[r].offsetWidth;
        this.el.res[r].parentElement.classList.add('bump');
      }
    }
    const pop = `${w.villagers.length}/${popCap(w)}`;
    if (this.el.pop.textContent !== pop) this.el.pop.textContent = pop;
    const day = `${w.night ? '🌙' : '☀️'} วันที่ ${w.day}`;
    if (this.el.day.textContent !== day) this.el.day.textContent = day;
    const frac = w.clock / (DAY_LEN + NIGHT_LEN);
    this.el.sun.style.width = `${Math.min(100, frac * 100).toFixed(1)}%`;
    this.el.sun.parentElement.classList.toggle('isnight', w.night);
    const sp = s.paused ? '❚❚' : `▶ ${s.speed}x`;
    if (this.el.speed.textContent !== sp) this.el.speed.textContent = sp;
    if ((this._rt = (this._rt || 0) + 1) % 15 === 0) this.refresh();
    if (s.selected && (this._rt % 10 === 0)) this.showInfo(w.buildings.find((b) => b.id === s.selected));
  }

  showInfo(b) {
    const el = this.el.info;
    if (!b) { el.classList.add('hidden'); return; }
    const def = BUILDINGS[b.type];
    $('[data-info-name]', el).textContent = def.name + (b.done ? '' : ' (กำลังสร้าง)');
    $('[data-info-hp]', el).textContent = `❤ ${Math.ceil(b.hp)}/${def.hp}`;
    $('[data-demolish]', el).classList.toggle('hidden', b.type === 'hall');
    el.classList.remove('hidden');
  }

  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  modal(html) {
    this.el.modal.innerHTML = `<div class="card">${html}</div>`;
    this.el.modal.classList.remove('hidden');
    if (this.scene) this.scene.paused = true;
  }
  closeModal() {
    this.el.modal.classList.add('hidden');
    if (this.scene && !this.scene.w.over) this.scene.paused = false;
  }

  menu() {
    this.modal(`
      <h2>พักเกม</h2>
      <div class="help">
        <p>🪓 ชาวบ้านจะตัดไม้ ขุดหิน เก็บผลไม้เองอัตโนมัติ</p>
        <p>🏠 สร้าง<b>บ้าน</b>เพิ่มประชากร (ใช้อาหารเกิดคนใหม่) · <b>ฟาร์ม</b>ผลิตอาหาร</p>
        <p>🌙 กลางคืนมอนสเตอร์บุก — สร้าง<b>หอธนู</b>และ<b>กำแพง</b>ป้องกันศาลากลาง</p>
        <p>👆 ลากเพื่อเลื่อนแผนที่ · ถ่างสองนิ้วเพื่อซูม · แตะอาคารเพื่อดู/รื้อ</p>
      </div>
      <div class="row">
        <button class="btn big" data-m="resume">เล่นต่อ</button>
        <button class="btn big" data-m="sound">${this.sound.muted ? '🔇 เสียงปิด' : '🔊 เสียงเปิด'}</button>
        <button class="btn big" data-m="fs">⛶ เต็มจอ</button>
        <button class="btn big danger" data-m="new">เริ่มใหม่</button>
      </div>`);
    this.modalButtons();
  }

  modalButtons() {
    this.el.modal.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      this.sound.unlock();
      const m = b.dataset.m;
      if (m === 'resume') this.closeModal();
      if (m === 'sound') { this.sound.muted = !this.sound.muted; this.menu(); }
      if (m === 'fs') { goFullscreen(); this.closeModal(); }
      if (m === 'new') {
        if (b.dataset.sure || this.scene.w.over) this.game.newGame();
        else { b.dataset.sure = '1'; b.textContent = 'แน่ใจ? แตะอีกครั้ง'; }
      }
      if (m === 'start') { goFullscreen(); this.closeModal(); }
    }));
  }

  title(hasSave) {
    this.modal(`
      <h1>Pixel Colony</h1>
      <p class="sub">สร้างหมู่บ้านเล็กๆ ของคุณ แล้วปกป้องมันในยามค่ำคืน</p>
      <div class="row">
        <button class="btn big" data-m="start">${hasSave ? 'เล่นต่อ' : 'เริ่มเล่น'}</button>
        ${hasSave ? '<button class="btn big danger" data-m="new">เริ่มใหม่</button>' : ''}
      </div>`);
    this.modalButtons();
  }

  gameOver() {
    const w = this.scene.w;
    this.sfx('over');
    this.modal(`
      <h2>ศาลากลางถูกทำลาย</h2>
      <p class="sub">หมู่บ้านของคุณอยู่รอดได้ <b>${w.day}</b> วัน · ปราบศัตรู <b>${w.stats.kills}</b> ตัว · ชาวบ้าน <b>${w.villagers.length}</b> คน</p>
      <div class="row"><button class="btn big" data-m="new">เริ่มหมู่บ้านใหม่</button></div>`);
    this.modalButtons();
  }
}

export function goFullscreen() {
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch { /* not supported (iOS Safari) */ }
}
