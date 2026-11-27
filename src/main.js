import Phaser from 'phaser';
import PlayScene, { loadSave, clearSave } from './scenes/PlayScene.js';
import { Hud } from './ui/hud.js';
import './style.css';
import { iconURL } from './art/sprites.js';
document.getElementById('rotate-ic').src = iconURL('phone', 6);

// Pixel-perfect scaling: the canvas holds the art at 1:1 and the browser shows it k screen pixels
// per art pixel, k a whole number of DEVICE pixels. Every pixel is the same size (no stretched,
// broken-looking pixels from a fractional scale) and the GPU still only fills a small canvas.
// k is picked so about 200 art pixels fit from top to bottom.
const dpr = () => window.devicePixelRatio || 1;
const fit = () => {
  const dh = window.innerHeight * dpr(), dw = window.innerWidth * dpr();
  const k = Math.max(2, Math.round(dh / 200));
  return { w: Math.ceil(dw / k), h: Math.ceil(dh / k), zoom: k / dpr() };
};
const first = fit();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1c2c',
  pixelArt: true,
  width: first.w,
  height: first.h,
  scale: { mode: Phaser.Scale.NONE, zoom: first.zoom },
  input: { activePointers: 3 },
  fps: { target: 60 },
  scene: [],
});
// Rotating a phone fires resize/orientationchange before the new size is final on some
// browsers (iOS reports the old size for a moment), so measure again a few times after.
let resizeTimers = [];
let lastFit = '';
const applyFit = () => {
  const f = fit(), key = `${f.w}x${f.h}@${f.zoom}`;
  if (key === lastFit) return;
  lastFit = key;
  game.scale.resize(f.w, f.h); game.scale.setZoom(f.zoom);
  const s = game.scene.getScene('play');
  if (s && s.w && s.cameras) s.recenter?.();
};
const onScreenChange = () => {
  resizeTimers.forEach(clearTimeout);
  resizeTimers = [60, 250, 600, 1200].map((ms) => setTimeout(applyFit, ms));
  updateRotate();
};
window.addEventListener('resize', onScreenChange);
window.addEventListener('orientationchange', onScreenChange);
window.visualViewport?.addEventListener('resize', onScreenChange);
screen.orientation?.addEventListener?.('change', onScreenChange);

// "Rotate your phone" screen: shown only while the page itself is upright, and it can always be
// skipped, so the game never gets stuck behind it (e.g. rotation lock, or inside another app).
const rotateEl = document.getElementById('rotate');
let rotateSkipped = false;
function updateRotate() {
  const upright = window.innerHeight > window.innerWidth && window.innerWidth <= 900;
  rotateEl.classList.toggle('show', upright && !rotateSkipped);
}
document.getElementById('rotate-skip').addEventListener('click', () => { rotateSkipped = true; updateRotate(); });
updateRotate();
window.addEventListener('load', onScreenChange);

const hud = new Hud(document.getElementById('hud'), {
  newGame() {
    clearSave();
    game.scene.getScene('play').scene.restart({ fresh: true });
  },
});
game.registry.set('hud', hud);
const ls = loadSave();
game.registry.set('hadSave', !!ls.w);
game.registry.set('loadInfo', ls);
game.scene.add('play', PlayScene, true);

import * as rules from './rules/world.js';
Object.assign(window, { game, colonyRules: rules }); // for the smoke and perf scripts
