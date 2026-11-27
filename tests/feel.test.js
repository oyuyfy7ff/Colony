import test from 'node:test';
import assert from 'node:assert/strict';
import { Trauma, HitStop, approach, TIERS } from '../src/feel.js';

test('trauma reaches 0 within 1/decay seconds and the offset returns to rest', () => {
  const t = new Trauma({ decay: 1.5 });
  t.add(TIERS.large.trauma); t.add(0.5); // hits add, capped at 1
  assert.equal(t.trauma, 1);
  let off;
  for (let s = 0; s <= 1 / 1.5 + 1e-9; s += 1 / 60) off = t.update(1 / 60);
  off = t.update(1 / 60);
  assert.equal(t.trauma, 0);
  assert.deepEqual(off, { x: 0, y: 0 });
});

test('two hit-stops 30 ms apart: time is slow until the LONGER one ends, then exactly 1', () => {
  const h = new HitStop();
  h.start(1000, 0.12);
  h.start(1030, 0.05); // shorter, later: must not end the first freeze early
  assert.equal(h.scale(1100), 0.05);
  assert.equal(h.scale(1119), 0.05);
  assert.equal(h.scale(1121), 1);
});

test('smoothing lag is the same at 30 and 144 FPS (frame-rate independent)', () => {
  const lag = (dt) => {
    let cam = 0, target = 0;
    for (let t = 0; t < 2; t += dt) { target += 300 * dt; cam = approach(cam, target, 8, dt); }
    return target - cam;
  };
  const a = lag(1 / 30), b = lag(1 / 144);
  assert.ok(Math.abs(a - b) < 6, `lag ${a.toFixed(1)} vs ${b.toFixed(1)}`);
});
