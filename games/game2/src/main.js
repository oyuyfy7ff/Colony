// จุดเริ่มเกมที่ 2 — แก้ได้ตามใจ
import Phaser from 'phaser';
import { SAVE_KEY } from './rules.js';

class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }
  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2, 'เกมที่ 2\nเริ่มเขียนที่ games/game2/src', {
      fontFamily: 'sans-serif', fontSize: '24px', color: '#f4f4f4', align: 'center',
    }).setOrigin(0.5);
    void SAVE_KEY;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1c2c',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [PlayScene],
});
