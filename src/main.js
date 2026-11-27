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
let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { const f = fit(); game.scale.resize(f.w, f.h); game.scale.setZoom(f.zoom); }, 100);
});

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
