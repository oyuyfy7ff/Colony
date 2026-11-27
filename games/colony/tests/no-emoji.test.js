import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Rule from the project owner: no emoji anywhere in the game. Stricter than that, the game's
// source may only contain ASCII and Thai, so no emoji or emoji-like symbol can sneak into the UI.
const files = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : [join(d, n)]));

test('game source and page contain no emoji or symbol characters', () => {
  const bad = [];
  for (const f of [...files('src'), 'index.html', 'public/manifest.webmanifest']) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/[^\x00-\x7f฀-๿]/gu)) bad.push(`${f}: ${m[0]} U+${m[0].codePointAt(0).toString(16).toUpperCase()}`);
  }
  assert.deepEqual(bad, []);
});
