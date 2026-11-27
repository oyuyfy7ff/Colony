// Game-feel helpers with no Phaser import, so they run under node --test (game-feel skill).

// Feedback tiers: every event fires one bundle so the whole game stays proportional.
export const TIERS = {
  small: { trauma: 0.12, stop: 0, parts: 4 },
  medium: { trauma: 0.4, stop: 0.05, parts: 10 },
  large: { trauma: 0.85, stop: 0.12, parts: 26 },
};

// Screen shake from decaying trauma: shake = trauma^2, summed sines (no per-frame random buzz),
// decays in REAL time so it never freezes off-centre during hit-stop.
export class Trauma {
  constructor({ decay = 1.5, maxX = 6, maxY = 4 } = {}) {
    Object.assign(this, { decay, maxX, maxY, trauma: 0, t: 0, strength: 1 });
  }
  add(a) { this.trauma = Math.min(1, this.trauma + a); }
  update(realDt) {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    this.trauma = Math.max(0, this.trauma - this.decay * realDt);
    this.t += realDt * 30;
    const s = this.trauma * this.trauma * this.strength;
    if (this.trauma === 0) return { x: 0, y: 0 };
    return { x: this.maxX * s * Math.sin(this.t * 1.7), y: this.maxY * s * Math.sin(this.t * 2.3) };
  }
}

// Hit-stop on the simulation clock only; overlapping stops keep the later end time, so an
// earlier, shorter stop can never restore time during a newer freeze.
export class HitStop {
  constructor() { this.until = 0; this.slow = 1; }
  start(nowMs, seconds, slow = 0.05) {
    if (seconds <= 0) return;
    const end = nowMs + seconds * 1000;
    if (end > this.until) this.until = end;
    this.slow = slow;
  }
  scale(nowMs) { return nowMs < this.until ? this.slow : 1; }
}

// Frame-rate independent smoothing (camera-systems skill): same feel at 30 or 144 FPS.
export const smoothT = (rate, dt) => 1 - Math.exp(-rate * dt);
export const approach = (cur, target, rate, dt) => cur + (target - cur) * smoothT(rate, dt);
