import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('persist hook wiring', () => {
  it('persist() calls stampLocalChanges before save', () => {
    const src = readFileSync(join(root, 'js/state.js'), 'utf8');
    const start = src.indexOf('export function persist(');
    assert.ok(start >= 0, 'persist() not found');
    const nextExport = src.indexOf('\nexport function', start + 1);
    const body = nextExport >= 0 ? src.slice(start, nextExport) : src.slice(start);
    const stampAt = body.search(/stampLocalChanges\s*\(/);
    const saveAt = body.search(/\bsave\s*\(/);
    assert.ok(stampAt >= 0, 'stampLocalChanges( missing in persist');
    assert.ok(saveAt >= 0, 'save( missing in persist');
    assert.ok(stampAt < saveAt, 'stampLocalChanges must appear before save');
  });

  it('sw.js ASSETS includes change-tracker.js', () => {
    const src = readFileSync(join(root, 'sw.js'), 'utf8');
    assert.match(src, /['"]\.\/js\/change-tracker\.js['"]/);
  });
});
