import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/rules.js';

test('save key is separate from Pixel Colony', () => {
  assert.notEqual(SAVE_KEY, '');
  assert.ok(!SAVE_KEY.includes('colony'));
});
