import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from './tmp.ts';

test('makeTree writes nested files', async () => {
  const root = await makeTree({ 'a/b/c.md': 'hello', 'top.txt': 'x' });
  assert.equal(await readFile(join(root, 'a/b/c.md'), 'utf8'), 'hello');
  assert.equal(await readFile(join(root, 'top.txt'), 'utf8'), 'x');
  await removeTree(root);
});
