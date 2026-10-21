import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, parseReview, proseIdsNotInBlock, verdictLineSays } from './findings.ts';

const review = `---
run: r1
target_kind: pr
head_sha: abc
---
\`\`\`yaml
- id: security-1
  severity: major
  relation: caused-by-change
  fix_cost: trivial
  fix_risk: contained
  title: Token logged
  location: a.go:1
  evidence: "log.Printf(token)"
  verified: true
  recommendation: blocks
  sources: [security]
- id: testing-2
  severity: minor
  relation: adjacent
  fix_cost: trivial
  fix_risk: contained
  title: Missing edge case
  location: a_test.go:9
  evidence: "no empty input case"
  verified: true
  recommendation: fix-now
  sources: [testing]
\`\`\`

**BLOCKING** — 2 findings.

- **Major** security-1 … (a.go:1)
- **Minor** testing-2 … (a_test.go:9)
`;

test('parseReview splits frontmatter, block and prose', () => {
  const r = parseReview(review);
  assert.equal(r.frontmatter['run'], 'r1');
  assert.equal(r.findings.length, 2);
  assert.deepEqual(r.withdrawn, []);
  assert.match(r.prose, /^\*\*BLOCKING\*\*/);
  assert.equal(r.verdictLine, '**BLOCKING** — 2 findings.');
  assert.equal(verdictLineSays(r.verdictLine), 'blocking');
  assert.equal(verdictLineSays('NON-BLOCKING — mergeable'), 'non-blocking');
});

test('mapping form with withdrawn is accepted', () => {
  const r = parseReview('---\nrun: r\n---\n```yaml\nfindings:\n  - id: security-1\n    severity: nit\n    recommendation: optional\nwithdrawn:\n  - id: security-3\n    reason: fixed\n```\nNON-BLOCKING — mergeable.\n');
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.withdrawn, [{ id: 'security-3', reason: 'fixed' }]);
});

test('computeVerdict: blocks on major+blocks, approve otherwise, comment when forced', () => {
  const r = parseReview(review);
  assert.equal(computeVerdict(r.findings, 'verdict'), 'request-changes');
  assert.equal(computeVerdict(r.findings.filter((f) => f.id !== 'security-1'), 'verdict'), 'approve');
  assert.equal(computeVerdict(r.findings, 'comment'), 'comment');
  assert.equal(computeVerdict([{ severity: 'critical', recommendation: 'follow-up' }], 'verdict'), 'approve');
});

test('proseIdsNotInBlock finds ghosts and ignores withdrawn ids', () => {
  const r = parseReview(review + '\nAlso see security-9 and testing-2.\n');
  assert.deepEqual(proseIdsNotInBlock(r), ['security-9']);
  const w = parseReview('---\nr: 1\n---\n```yaml\nfindings: []\nwithdrawn:\n  - id: security-3\n    reason: fixed\n```\nWithdrawn: security-3.\n');
  assert.deepEqual(proseIdsNotInBlock(w), []);
});

test('missing block and invalid entries throw', () => {
  assert.throws(() => parseReview('---\nr: 1\n---\nno block here\n'), /findings block/);
  assert.throws(() => parseReview('```yaml\n- id: security-1\n  severity: huge\n  recommendation: blocks\n```\n'), /invalid severity/);
});
