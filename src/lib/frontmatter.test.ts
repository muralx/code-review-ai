import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from './frontmatter.ts';

test('no frontmatter: empty object, body untouched', () => {
  const r = parseMarkdown('# Hi\n\ntext\n');
  assert.deepEqual(r.frontmatter, {});
  assert.equal(r.body, '# Hi\n\ntext\n');
});

test('applies_to is parsed and the block is stripped', () => {
  const r = parseMarkdown('---\napplies_to: [pr, local]\n---\nbody\n');
  assert.deepEqual(r.frontmatter, { applies_to: ['pr', 'local'] });
  assert.equal(r.body, 'body\n');
});

test('CRLF frontmatter is accepted', () => {
  const r = parseMarkdown('---\r\napplies_to: [audit]\r\n---\r\nbody');
  assert.deepEqual(r.frontmatter.applies_to, ['audit']);
  assert.equal(r.body, 'body');
});

test('the retired mode key is ignored, not an error', () => {
  const r = parseMarkdown('---\nmode: replace\n---\nbody', 'x/y.md');
  assert.deepEqual(r.frontmatter, {});
  assert.equal(r.body, 'body');
});

test('invalid applies_to throws', () => {
  assert.throws(() => parseMarkdown('---\napplies_to: [github]\n---\n'), /applies_to must be a list of pr \| audit \| local/);
});

test('unknown keys are ignored', () => {
  const r = parseMarkdown('---\nowner: platform\n---\nb');
  assert.deepEqual(r.frontmatter, {});
});
