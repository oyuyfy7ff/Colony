// WebAudio mix and generative chiptune (audio-design skill).
// Buses: Master(limiter) <- Music <- MusicDuck <- music voices, SFX, UI. Sliders square the
// 0..1 value into gain; ducking tweens its own bus so it never overwrites the player's slider.
// Music: horizontal sections (day / dusk / night) switched on bar lines, plus a vertical drum
// layer whose gain follows raid intensity. SFX get small random pitch and volume offsets.

export const BPM = 96;
export const BAR = (60 / BPM) * 4;
const SEMI = 2 ** (1 / 12);
const midi = (n) => 440 * SEMI ** (n - 69);

// chord roots (MIDI) and pentatonic tones per section, 4 bars each
const SECTIONS = {
  day:   { chords: [48, 45, 41, 43], minor: [false, true, false, false], arp: 1, hats: 0 },
  dusk:  { chords: [45, 41, 43, 40], minor: [true, false, false, true], arp: 0.5, hats: 0 },
  night: { chords: [45, 41, 48, 43], minor: [true, false, false, false], arp: 0.6, hats: 1 },
};

const SFX = {
  click: { bus: 'ui', notes: [[880, 0.04, 'square', 0.18]] },
  place: { bus: 'sfx', notes: [[440, 0.06, 'square', 0.22], [660, 0.08, 'square', 0.2]] },
  built: { bus: 'sfx', notes: [[523, 0.07, 'square', 0.18], [659, 0.07, 'square', 0.18], [784, 0.12, 'square', 0.18]] },
  bad: { bus: 'ui', notes: [[160, 0.12, 'sawtooth', 0.16]] },
  hit: { bus: 'sfx', notes: [[300, 0.03, 'square', 0.08]], vary: 2 },
  kill: { bus: 'sfx', notes: [[200, 0.05, 'triangle', 0.35], [120, 0.1, 'triangle', 0.35]], vary: 1.5 },
  boom: { bus: 'sfx', notes: [[90, 0.25, 'sawtooth', 0.3], [60, 0.3, 'triangle', 0.4]], noise: 0.25 },
  born: { bus: 'sfx', notes: [[784, 0.06, 'triangle', 0.25], [1046, 0.12, 'triangle', 0.25]] },
  chop: { bus: 'sfx', notes: [[220, 0.03, 'square', 0.05]], vary: 2, noise: 0.03 },
  night: { bus: 'ui', stinger: true, notes: [[392, 0.18, 'triangle', 0.3], [330, 0.18, 'triangle', 0.3], [262, 0.4, 'triangle', 0.3]] },
  day: { bus: 'ui', stinger: true, notes: [[523, 0.12, 'triangle', 0.3], [659, 0.12, 'triangle', 0.3], [784, 0.35, 'triangle', 0.3]] },
  over: { bus: 'ui', stinger: true, notes: [[330, 0.25, 'square', 0.2], [262, 0.25, 'square', 0.2], [196, 0.5, 'square', 0.2]] },
};

function tone(ctx, dest, t, f, d, type, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + d + 0.02);
}
let noiseBuf = null;
function noise(ctx, dest, t, d, vol, hp = 6000) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f).connect(g).connect(dest);
  s.start(t); s.stop(t + d + 0.02);
}

// One bar of music into `melody` and `drums` nodes. Pure scheduling: works on a live or an
// OfflineAudioContext (used to meter loudness in tools/measure-audio).
export function scheduleBar(ctx, melody, drums, t0, bar, section, rnd = Math.random) {
  const sec = SECTIONS[section];
  const root = sec.chords[bar % 4], minor = sec.minor[bar % 4];
  const triad = [0, minor ? 3 : 4, 7, 12];
  const beat = BAR / 4;
  // bass on 1 and 3
  tone(ctx, melody, t0, midi(root - 12), beat * 1.8, 'triangle', 0.32);
  tone(ctx, melody, t0 + beat * 2, midi(root - 12), beat * 1.8, 'triangle', 0.26);
  // soft pad: chord tones, long
  for (const iv of triad.slice(0, 3)) tone(ctx, melody, t0, midi(root + 12 + iv), BAR * 0.95, 'sine', 0.05);
  // arpeggio eighths, thinned by section density
  for (let k = 0; k < 8; k++) {
    if (rnd() > sec.arp) continue;
    const n = root + 24 + triad[(k + (bar % 2)) % 4];
    tone(ctx, melody, t0 + k * beat / 2, midi(n), beat * 0.45, 'square', 0.045);
  }
  // drums (vertical layer: its bus gain follows intensity)
  if (sec.hats) {
    for (let k = 0; k < 8; k++) noise(ctx, drums, t0 + k * beat / 2, 0.04, k % 2 ? 0.05 : 0.08);
    for (const k of [0, 2]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + k * beat;
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(drums); o.start(t); o.stop(t + 0.25);
    }
  }
}

export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.last = {};
    this.section = 'day';
    this.nextSection = 'day';
    this.intensity = 0;
    this.bar = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const limiter = ctx.createDynamicsCompressor(); // safety net at the end of the chain, not the mixer
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.1;
    this.master = ctx.createGain(); this.master.gain.value = 0.5; // headroom for a ~-18 LUFS mobile mix
    this.master.connect(limiter).connect(ctx.destination);
    this.bus = {};
    for (const b of ['music', 'sfx', 'ui']) { this.bus[b] = ctx.createGain(); this.bus[b].connect(this.master); }
    this.duck = ctx.createGain(); this.duck.connect(this.bus.music);
    this.melody = ctx.createGain(); this.melody.connect(this.duck);
    this.drums = ctx.createGain(); this.drums.gain.value = 0; this.drums.connect(this.duck);
    this.applyVolumes();
    this.nextBarAt = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 50);
  }

  // slider 0..1 -> gain slider^2 (perceptually even); 0 is silence
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const g = (v) => Math.max(0, Math.min(1, v)) ** 2;
    const t = this.ctx.currentTime;
    this.bus.music.gain.setTargetAtTime(g(s.music) * 0.6, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(g(s.sfx), t, 0.05);
    this.bus.ui.gain.setTargetAtTime(g(s.sfx), t, 0.05);
  }

  // lookahead scheduler: queue whole bars ~0.3 s ahead; section changes land on the bar line
  pump() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextBarAt < ctx.currentTime + 0.3) {
      if (this.nextSection !== this.section && this.bar % 2 === 0) this.section = this.nextSection;
      scheduleBar(ctx, this.melody, this.drums, this.nextBarAt, this.bar, this.section);
      this.drums.gain.setTargetAtTime(this.section === 'night' ? 0.35 + 0.65 * this.intensity : 0, this.nextBarAt, 0.4);
      this.nextBarAt += BAR;
      this.bar++;
    }
  }

  // called by the scene a few times a second
  setMood(section, intensity) {
    this.nextSection = section;
    this.intensity = this.intensity + (Math.max(0, Math.min(1, intensity)) - this.intensity) * 0.2; // smoothed, no flicker
  }

  play(name) {
    const def = SFX[name];
    const ctx = this.ctx;
    if (!def || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.06) return; // cap stacking of the same blip
    this.last[name] = now;
    const vary = def.vary ?? 1;                                  // +/- semitones
    const p = SEMI ** ((Math.random() * 2 - 1) * vary);
    const v = 10 ** (((Math.random() * 2 - 1) * 2) / 20);        // +/- 2 dB
    const dest = this.bus[def.bus];
    let t = now;
    for (const [f, d, type, vol] of def.notes) { tone(ctx, dest, t, f * p, d, type, vol * v); t += d * 0.9; }
    if (def.noise) noise(ctx, dest, now, 0.25, def.noise, 800);
    if (def.stinger) this.duckFor(t - now + 0.2);
  }

  duckFor(seconds) {
    const g = this.duck.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.35, t, 0.03);            // about -9 dB
    g.setTargetAtTime(1, t + seconds, 0.35);     // slow release: no pumping
  }
}
