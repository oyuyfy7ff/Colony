import Phaser from 'phaser';
import PlayScene, { loadSave, clearSave } from './scenes/PlayScene.js';
import { Hud } from './ui/hud.js';
import './style.css';
import { iconURL } from './art/sprites.js';
document.getElementById('rotate-ic').src = iconURL('phone', 6);

const BASE_H = 270; // virtual pixels tall; width follows the screen's aspect

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1c2c',
  pixelArt: true,
  width: 480,
  height: BASE_H,
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  fps: { target: 60 },
  scene: [],
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
