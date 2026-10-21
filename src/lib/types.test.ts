import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TYPES, REVIEW_TYPES, KINDS, LANGUAGES, TARGET_KINDS, isKind, isReviewType } from './types.ts';

test('review types are the nine known ones, in priority order; seven run by default', () => {
  assert.deepEqual([...REVIEW_TYPES], [
    'security', 'testing', 'spec-compliance', 'coding-practices', 'code-structure',
    'performance', 'architecture', 'system-design', 'documentation',
  ]);
  assert.deepEqual([...DEFAULT_TYPES], [
    'security', 'testing', 'coding-practices', 'code-structure',
    'architecture', 'system-design', 'documentation',
  ]);
  for (const t of DEFAULT_TYPES) assert.ok(REVIEW_TYPES.includes(t));
});

test('vocabularies', () => {
  assert.deepEqual([...KINDS], ['service', 'library', 'tool', 'website', 'contracts', 'spec']);
  assert.equal(isKind('contracts'), true);
  assert.equal(isKind('monolith'), false);
  assert.deepEqual([...LANGUAGES], ['go', 'python', 'ts', 'java']);
  assert.deepEqual([...TARGET_KINDS], ['pr', 'audit', 'local']);
  assert.equal(isReviewType('security'), true);
  assert.equal(isReviewType('vibes'), false);
});
