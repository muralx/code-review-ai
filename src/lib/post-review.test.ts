import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { installGhStub, withEnv } from '../../tests/helpers/gh-stub.ts';
import { checkReview, postReview, PostRefused } from './post-review.ts';

const runJson = (extra: Record<string, unknown> = {}) => JSON.stringify({
  id: 'r1', action: 'review', status: 'delivering', attempts: 1, identity: 'abc',
  target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'abc', url: 'https://x/7' },
  source: { intake: 'poll' }, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z', types: ['security', 'testing'], ...extra,
});
const planJson = (posting: Record<string, unknown>) => JSON.stringify({ posting: { policy: 'auto', post: true, form: 'verdict', needsHuman: false, reason: 'project policy auto', ...posting } });
const reviewMd = (severity: string, recommendation: string, verdictLine: string, extraProse = '') => `---
run: r1
---
\`\`\`yaml
- id: security-1
  severity: ${severity}
  relation: caused-by-change
  fix_cost: trivial
  fix_risk: contained
  title: Token logged
  location: a.go:1
  evidence: "x"
  verified: true
  recommendation: ${recommendation}
  sources: [security, testing]
\`\`\`

${verdictLine}

- **${severity}** security-1 token logged (a.go:1)
${extraProse}`;

async function runDir(files: Record<string, string>, id = 'r1', runs?: string) {
  runs ??= await makeTree({ [`${id}/placeholder`]: '' });
  await (await import('node:fs/promises')).mkdir(join(runs, id), { recursive: true });
  for (const [k, v] of Object.entries(files)) await (await import('node:fs/promises')).writeFile(join(runs, id, k), v);
  return { runs, dir: join(runs, id) };
}

test('approve path: posts, adapts body, records delivery', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', '**NON-BLOCKING — mergeable.**') });
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc"}' }, { match: 'pr review 7 --repo acme/widgets --approve', stdout: '' }]);
  const r = await withEnv(stub.env, () => postReview({ runDir: dir }));
  assert.equal(r.verdict, 'approve');
  assert.equal(r.posted, true);
  const calls = await stub.calls();
  assert.deepEqual(calls[0], ['pr', 'view', '7', '--repo', 'acme/widgets', '--json', 'headRefOid,author']);
  assert.deepEqual(calls[1], ['pr', 'review', '7', '--repo', 'acme/widgets', '--approve', '--body-file', join(dir, 'posted.md')]);
  const posted = await readFile(join(dir, 'posted.md'), 'utf8');
  assert.doesNotMatch(posted, /^---\nrun:/);
  assert.doesNotMatch(posted, /```yaml/);
  assert.match(posted, /^\*\*NON-BLOCKING — mergeable\.\*\*/);
  assert.match(posted, /\n---\n\*\*Review by code-reviewer agent\*\*\n\nFound by: `security-1` security, testing\n\n\*Automated review · run r1 · types: security, testing · 1 finding\*\n$/);
  const run = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  assert.equal(run.delivery.posted_sha, 'abc');
  assert.equal(run.delivery.verdict, 'approve');
  const index = await readFile(join(runs, 'index.jsonl'), 'utf8');
  assert.match(index, /"event":"posted"/);
  await removeTree(runs);
});

test('major + blocks → request-changes; comment-only → comment', async () => {
  const a = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('major', 'blocks', '**BLOCKING**') });
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc"}' }, { match: 'pr review', stdout: '' }]);
  assert.equal((await withEnv(stub.env, () => postReview({ runDir: a.dir }))).verdict, 'request-changes');
  const b = await runDir({ 'run.json': runJson(), 'plan.json': planJson({ policy: 'comment-only', form: 'comment' }), 'review.md': reviewMd('major', 'blocks', '**BLOCKING**') });
  assert.equal((await withEnv(stub.env, () => postReview({ runDir: b.dir }))).verdict, 'comment');
  const calls = await stub.calls();
  assert.equal(calls[1]?.[5], '--request-changes');
  assert.equal(calls[3]?.[5], '--comment');
  await removeTree(a.runs); await removeTree(b.runs);
});

test('verdict line disagreement is recorded but the computed verdict wins', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', '**BLOCKING** — 1 finding.') });
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc"}' }, { match: 'pr review', stdout: '' }]);
  const r = await withEnv(stub.env, () => postReview({ runDir: dir }));
  assert.equal(r.verdict, 'approve');
  assert.match(r.disagreement ?? '', /computes approve/);
  const run = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  assert.match(run.delivery.verdict_disagreement, /computes approve/);
  await removeTree(runs);
});

test('refusals: ghost id (4), non-PR (3), posting disabled (3), needs human (3); no gh call', async () => {
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc"}' }, { match: 'pr review', stdout: '' }]);
  const ghost = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING', 'See also security-4.\n') });
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: ghost.dir })), (e: PostRefused) => e.code === 4 && /security-4/.test(e.message));
  const audit = await runDir({ 'run.json': runJson({ target: { kind: 'audit', repo: 'acme/widgets', ref: 'main' } }), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', 'summary') });
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: audit.dir })), (e: PostRefused) => e.code === 3);
  const off = await runDir({ 'run.json': runJson(), 'plan.json': planJson({ post: false, form: null }), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: off.dir })), (e: PostRefused) => e.code === 3);
  const human = await runDir({ 'run.json': runJson(), 'plan.json': planJson({ post: false, form: null, needsHuman: true }), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: human.dir })), (e: PostRefused) => e.code === 3);
  assert.deepEqual(await stub.calls(), []);
  for (const d of [ghost, audit, off, human]) await removeTree(d.runs);
});

test('head moved during the run: refused with 3 before any review is posted', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  const before = await readFile(join(dir, 'run.json'), 'utf8');
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"f292b18aa"}' }, { match: 'pr review', stdout: '' }]);
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: dir })), (e: PostRefused) => e.code === 3 && /head moved from abc to f292b18/.test(e.message));
  assert.equal((await stub.calls()).filter((c) => c[1] === 'review').length, 0);
  assert.equal(await readFile(join(dir, 'run.json'), 'utf8'), before);
  await removeTree(runs);
});

test('dry run writes posted.md, calls nothing, leaves run.json alone; gh failure leaves run.json alone', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  const before = await readFile(join(dir, 'run.json'), 'utf8');
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc"}' }, { match: 'pr review', exit: 1, stderr: 'HTTP 403' }]);
  const r = await withEnv(stub.env, () => postReview({ runDir: dir, dryRun: true }));
  assert.equal(r.posted, false);
  assert.ok((await readFile(join(dir, 'posted.md'), 'utf8')).length > 0);
  assert.deepEqual(await stub.calls(), []);
  await assert.rejects(withEnv(stub.env, () => postReview({ runDir: dir })), /HTTP 403/);
  assert.equal(await readFile(join(dir, 'run.json'), 'utf8'), before);
  await removeTree(runs);
});

test('checkReview: ok, merged-from ids accepted, ghost ids and broken YAML reported; posting policy ignored', async () => {
  const off = planJson({ post: false, form: null });
  const ok = await runDir({ 'run.json': runJson(), 'plan.json': off, 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  assert.deepEqual(await checkReview(ok.dir), []);
  const merged = reviewMd('minor', 'fix-now', 'NON-BLOCKING', 'testing-2 said the same.\n')
    .replace('  sources: [security, testing]', '  sources: [security, testing]\n  merged_from: [security-1, testing-2]');
  const m = await runDir({ 'run.json': runJson(), 'plan.json': off, 'review.md': merged });
  assert.deepEqual(await checkReview(m.dir), []);
  const ghost = await runDir({ 'run.json': runJson(), 'plan.json': off, 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING', 'See also security-4.\n') });
  assert.match((await checkReview(ghost.dir)).join(), /absent from the block: security-4/);
  // The merger's usual slip: a quoted scalar followed by more text on the same line.
  const broken = await runDir({ 'run.json': runJson(), 'plan.json': off, 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING').replace('evidence: "x"', 'evidence: "x" and more') });
  assert.match((await checkReview(broken.dir)).join(), /does not parse/);
  for (const d of [ok, m, ghost, broken]) await removeTree(d.runs);
});

test('checkReview on a re-review accepts ids from every earlier round, not unknown ones', async () => {
  const off = planJson({ post: false, form: null });
  // Round 1 found security-1; round 2 withdrew it and found testing-3 (listed as merged into m1).
  const r1 = await runDir({ 'run.json': runJson({ id: 'p1' }), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') }, 'p1');
  const round2 = '---\nrun: p2\n---\n```yaml\nfindings:\n  - id: m1\n    severity: minor\n    relation: caused-by-change\n    fix_cost: trivial\n    fix_risk: contained\n    title: t\n    location: a.go:2\n    evidence: "y"\n    verified: true\n    recommendation: fix-now\n    sources: [testing]\n    merged_from: [testing-3]\nwithdrawn:\n  - id: security-1\n    reason: fixed\n```\n\nNON-BLOCKING\n';
  await runDir({ 'run.json': runJson({ id: 'p2', prior_run: 'p1' }), 'review.md': round2 }, 'p2', r1.runs);
  const prose = 'security-1 was withdrawn two rounds ago; testing-3 and m1 are resolved. See also security-4.\n';
  const r3 = await runDir({ 'run.json': runJson({ prior_run: 'p2' }), 'plan.json': off, 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING', prose).replace('id: security-1', 'id: security-7').replace('security-1 token', 'security-7 token') }, 'r1', r1.runs);
  assert.deepEqual(await checkReview(r3.dir), ['prose mentions findings absent from the block: security-4']);
  await removeTree(r1.runs);
});

test('a pull request opened by the bot account gets the verdict as a comment review', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('major', 'blocks', '**BLOCKING**') });
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc","author":{"login":"Review-Bot"}}' }, { match: 'api user', stdout: 'review-bot\n' }, { match: 'pr review', stdout: '' }]);
  const r = await withEnv(stub.env, () => postReview({ runDir: dir }));
  assert.equal(r.verdict, 'request-changes');
  assert.equal(r.postedAs, 'comment');
  const calls = await stub.calls();
  assert.equal(calls.find((c) => c[1] === 'review')?.[5], '--comment');
  assert.match(await readFile(join(dir, 'posted.md'), 'utf8'), /^> \*\*Verdict: Request changes\.\*\* Posted as a comment/);
  const run = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  assert.equal(run.delivery.verdict, 'request-changes');
  assert.equal(run.delivery.posted_as, 'comment');
  await removeTree(runs);
});

test('a pull request by someone else posts the verdict itself', async () => {
  const { runs, dir } = await runDir({ 'run.json': runJson(), 'plan.json': planJson({}), 'review.md': reviewMd('minor', 'fix-now', 'NON-BLOCKING') });
  const stub = await installGhStub([{ match: 'pr view 7', stdout: '{"headRefOid":"abc","author":{"login":"dev"}}' }, { match: 'api user', stdout: 'review-bot\n' }, { match: 'pr review', stdout: '' }]);
  const r = await withEnv(stub.env, () => postReview({ runDir: dir }));
  assert.equal(r.postedAs, undefined);
  assert.equal((await stub.calls()).find((c) => c[1] === 'review')?.[5], '--approve');
  await removeTree(runs);
});
