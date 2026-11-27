// Tiny WebAudio synth: chiptune blips, no audio files.
const NOTES = {
  click: [[880, 0.04, 'square', 0.05]],
  place: [[440, 0.06, 'square', 0.07], [660, 0.08, 'square', 0.06]],
  built: [[523, 0.07, 'square', 0.06], [659, 0.07, 'square', 0.06], [784, 0.12, 'square', 0.06]],
  bad: [[160, 0.12, 'sawtooth', 0.06]],
  hit: [[300, 0.03, 'square', 0.025]],
  kill: [[200, 0.05, 'triangle', 0.1], [120, 0.1, 'triangle', 0.1]],
  born: [[784, 0.06, 'triangle', 0.08], [1046, 0.12, 'triangle', 0.08]],
  night: [[392, 0.18, 'triangle', 0.08], [330, 0.18, 'triangle', 0.08], [262, 0.35, 'triangle', 0.08]],
  day: [[523, 0.12, 'triangle', 0.08], [659, 0.12, 'triangle', 0.08], [784, 0.3, 'triangle', 0.08]],
  over: [[330, 0.25, 'square', 0.06], [262, 0.25, 'square', 0.06], [196, 0.5, 'square', 0.06]],
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    try { this.muted = localStorage.getItem('pixel-colony-muted') === '1'; } catch { this.muted = false; }
  }
  get muted() { return this._m; }
  set muted(v) { this._m = v; try { localStorage.setItem('pixel-colony-muted', v ? '1' : '0'); } catch { /* ignore */ } }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) this.ctx = new AC();
  }
  play(name) {
    if (this.muted || !this.ctx || !NOTES[name]) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.06) return; // avoid stacking the same blip
    this.last[name] = now;
    let t = now;
    for (const [f, d, type, vol] of NOTES[name]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d * 0.9;
    }
  }
}
