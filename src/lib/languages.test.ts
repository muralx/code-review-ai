import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferLanguages } from './languages.ts';

test('maps extensions and orders by file count, ties alphabetical', () => {
  assert.deepEqual(inferLanguages(['a.go', 'b.go', 'c.ts', 'd.py', 'e.py', 'f.java']), ['go', 'python', 'java', 'ts']);
});

test('javascript counts as ts; unknown extensions are ignored', () => {
  assert.deepEqual(inferLanguages(['x.js', 'y.jsx', 'z.md', 'Makefile']), ['ts']);
});

test('empty input gives empty output', () => {
  assert.deepEqual(inferLanguages([]), []);
});
