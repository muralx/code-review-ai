import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskBlock, type TaskInput } from './task-block.ts';

const base: TaskInput = {
  run_id: '2026-10-11T14-03-22Z-acme-widgets-123',
  target_kind: 'pr',
  repo: 'acme/widgets',
  pr: { number: 123, url: 'https://github.com/acme/widgets/pull/123', title: 'Replace token cache', base: 'main', head_sha: 'abc123' },
  target_dir: '/runs/r1/target',
  work_dir: '/runs/r1/work/security',
  meta_dir: '/runs/r1/meta',
  diff_path: '/runs/r1/meta/diff.patch',
  files_path: '/runs/r1/meta/files.json',
  siblings: ['/clones/acme-widgets-sdk'],
  prior_review: null,
  requester_context: 'Please focus on invalidation.',
  output_path: '/runs/r1/findings/security.md',
  frontmatter: { run: '2026-10-11T14-03-22Z-acme-widgets-123', type: 'security', head_sha: 'abc123' },
};

test('PR task block names every input and the output contract', () => {
  const s = renderTaskBlock(base);
  assert.match(s, /^## Task\n/m);
  assert.match(s, /Pull request acme\/widgets#123/);
  assert.match(s, /Diff: \/runs\/r1\/meta\/diff\.patch/);
  assert.match(s, /Sibling repositories \(read-only\):\n- \/clones\/acme-widgets-sdk/);
  assert.match(s, /Prior review: none/);
  assert.match(s, /Requester context:\n\n> Please focus on invalidation\./);
  assert.match(s, /Write your findings to `\/runs\/r1\/findings\/security\.md`/);
  assert.match(s, /```yaml\nrun: 2026-10-11T14-03-22Z-acme-widgets-123\ntype: security\nhead_sha: abc123\n```/);
});

test('audit task block describes scope and has no diff', () => {
  const s = renderTaskBlock({ ...base, target_kind: 'audit', pr: undefined, diff_path: undefined, ref: 'main', paths: ['internal/token'] });
  assert.match(s, /Audit of acme\/widgets at main/);
  assert.match(s, /Scope: internal\/token/);
  assert.doesNotMatch(s, /Diff:/);
});

test('local task block names the host path and base', () => {
  const s = renderTaskBlock({ ...base, target_kind: 'local', repo: undefined, pr: undefined, path: '/home/you/dev/widgets', ref: 'main' });
  assert.match(s, /Local working tree \/home\/you\/dev\/widgets, compared against main/);
});

test('rendering is deterministic', () => {
  assert.equal(renderTaskBlock(base), renderTaskBlock(base));
});

test('the task block gives the specialist its own working directory and a way to get a tree', () => {
  const pr = renderTaskBlock(base);
  assert.match(pr, /Working directory \(yours alone; create, change and delete anything in it\): \/runs\/r1\/work\/security/);
  assert.match(pr, /git -C \/runs\/r1\/target worktree add --detach \/runs\/r1\/work\/security\/tree HEAD/);
  assert.match(pr, /worktree add --detach \/runs\/r1\/work\/security\/<name> <ref>/);
  const local = renderTaskBlock({ ...base, target_kind: 'local', path: '/home/you/dev/widgets', ref: 'main' });
  assert.match(local, /cp -a \/runs\/r1\/target \/runs\/r1\/work\/security\/tree/);
});

test('a re-review is told how to diff the commits since the prior review', () => {
  const t = { ...base, prior_review: '/runs/r0/review.md', prior_head: 'abc1234' };
  assert.match(renderTaskBlock(t), /Commits since the prior review: `git -C \/runs\/r1\/target diff abc1234 HEAD`/);
  assert.doesNotMatch(renderTaskBlock({ ...base, prior_head: 'abc1234' }), /Commits since/);
});
