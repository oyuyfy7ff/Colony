// Save file handling (save-systems skill): plain JSON data, an integer version with step-by-step
// migrations, a .bak of the previous good save, defensive loading. Storage is injected so the
// same code runs on localStorage in the game and on a Map in tests.
import { MAP_W, MAP_H } from './config.js';
import { rebuild, previewNight } from './world.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'pixel-colony-save';

// v -> v+1, pure functions. Keep every one forever: deleting one strands that version's saves.
export const MIGRATIONS = {
  1: (d) => {
    // v2 added breakfast (fed), the telegraphed next raid and per-enemy pathing fields
    d.fed = d.fed ?? true;
    d.nextWave = null;
    d.nextSide = d.nextSide ?? 0;
    for (const e of d.enemies || []) Object.assign(e, { path: [], prog: 999, best: 999, stuckT: 0 });
    for (const s of d.spawnQueue || []) s.hpMul = s.hpMul ?? 1;
    return d;
  },
};

export function serializeWorld(w) {
  const { _flowDirty, events, ...rest } = w;
  return JSON.stringify({ ...rest, v: SAVE_VERSION, events: [] });
}

export function validate(d) {
  const ok = d && Array.isArray(d.terrain) && d.terrain.length === MAP_W * MAP_H
    && Array.isArray(d.buildings) && d.buildings.some((b) => b.type === 'hall')
    && Array.isArray(d.villagers) && d.stock && ['wood', 'stone', 'food'].every((k) => Number.isFinite(d.stock[k]))
    && Number.isInteger(d.day) && d.day >= 1;
  if (!ok) throw new Error('invalid save');
}

// Returns { w } or { error: 'none' | 'newer' | 'corrupt' }.
export function parseSave(json) {
  let d;
  try { d = JSON.parse(json); } catch { return { error: 'corrupt' }; }
  if (!d || typeof d !== 'object') return { error: 'corrupt' };
  let v = Number.isInteger(d.v) ? d.v : 1;
  if (v > SAVE_VERSION) return { error: 'newer', version: v };
  try {
    while (v < SAVE_VERSION) { d = MIGRATIONS[v](d); v++; d.v = v; }
    validate(d);
  } catch { return { error: 'corrupt' }; }
  d.events = [];
  rebuild(d);
  if (!d.nextWave || d.nextWave.day !== d.day) previewNight(d);
  return { w: d };
}

export function loadFrom(storage, key = SAVE_KEY) {
  let first = null;
  for (const [k, from] of [[key, 'primary'], [key + '.bak', 'backup']]) {
    let json = null;
    try { json = storage.getItem(k); } catch { /* storage blocked */ }
    if (json == null) continue;
    const r = parseSave(json);
    if (r.w) return { w: r.w, from, problem: first };
    if (r.error === 'newer') return r; // never half-load or overwrite a newer build's save
    first = first || r.error;
  }
  return { error: first || 'none' };
}

// Write the new save under a temp key, keep the last good save as .bak, then swap it in.
export function writeTo(storage, w, key = SAVE_KEY) {
  const json = serializeWorld(w);
  try {
    storage.setItem(key + '.tmp', json);
    const prev = storage.getItem(key);
    if (prev != null && !parseSave(prev).error) storage.setItem(key + '.bak', prev);
    storage.setItem(key, json);
    storage.removeItem(key + '.tmp');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'full' : 'blocked' };
  }
}

export function clearFrom(storage, key = SAVE_KEY) {
  for (const k of [key, key + '.bak', key + '.tmp']) { try { storage.removeItem(k); } catch { /* ignore */ } }
}
