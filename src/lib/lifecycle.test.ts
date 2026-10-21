import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { cleanRetired, finishRun, newRun, removeWork, stopRunProcesses, requestFromCandidate, runIdFor, setStatus, statusSummary } from './lifecycle.ts';
import { readRun, writeRun } from './runs.ts';

const exec = promisify(execFile);
const now = new Date('2026-10-11T14:03:22.123Z');

test('run ids are timestamped and slugged per target kind', () => {
  assert.equal(runIdFor({ id: '', action: 'review', target: { kind: 'pr', repo: 'Acme/Widgets', number: 123 } }, now), '2026-10-11T14-03-22Z-acme-widgets-123');
  assert.equal(runIdFor({ id: '', action: 'review', target: { kind: 'audit', repo: 'acme/widgets', ref: 'main' } }, now), '2026-10-11T14-03-22Z-audit-acme-widgets');
  assert.equal(runIdFor({ id: '', action: 'review', target: { kind: 'local', path: '/home/you/dev/My Tree' } }, now), '2026-10-11T14-03-22Z-local-my-tree');
});

test('newRun writes request.json, run.json queued and an index line; setStatus transitions', async () => {
  const runs = await makeTree({});
  const run = await newRun({ runsDir: runs, request: { id: '', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 7 }, types: ['security'] }, source: { intake: 'agent-link', conversation_id: 'cv_1', from: 'builder' }, head_sha: 'abc', now });
  assert.equal(run.id, '2026-10-11T14-03-22Z-acme-widgets-7');
  assert.equal(run.status, 'queued');
  assert.deepEqual(run.target, { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'abc' });
  const req = JSON.parse(await readFile(join(runs, run.id, 'request.json'), 'utf8'));
  assert.equal(req.id, run.id);
  await setStatus(runs, run.id, 'preparing');
  await setStatus(runs, run.id, 'failed', { failure: 'boom' });
  const saved = await readRun(join(runs, run.id));
  assert.equal(saved.status, 'failed');
  assert.equal(saved.failure, 'boom');
  const index = (await readFile(join(runs, 'index.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(index.length, 3);
  await removeTree(runs);
});

test('requestFromCandidate carries attempts, retry_of, prior_run and the head sha', () => {
  const { request, extra } = requestFromCandidate({ action: 'rereview', repo: 'acme/widgets', number: 7, head_sha: 'def', title: 't', url: 'u', base: 'main', reason: 'retry', retry_of: 'r1', prior_run: 'r0', attempts: 2 }, now);
  assert.equal(request.action, 'rereview');
  assert.equal(request.id, '2026-10-11T14-03-22Z-acme-widgets-7');
  assert.deepEqual(extra, { attempts: 2, head_sha: 'def', retry_of: 'r1', prior_run: 'r0' });
});

test('finishRun done removes a git worktree target and prunes the clone; failed keeps it', async () => {
  const tmp = await makeTree({});
  const clone = join(tmp, 'clone');
  await mkdir(clone);
  await exec('git', ['init', '-q', clone]);
  await exec('git', ['-C', clone, 'config', 'user.email', 't@x']);
  await exec('git', ['-C', clone, 'config', 'user.name', 't']);
  await writeFile(join(clone, 'a'), 'a');
  await exec('git', ['-C', clone, 'add', 'a']);
  await exec('git', ['-C', clone, 'commit', '-q', '-m', 'c']);
  const runs = join(tmp, 'runs');
  for (const id of ['r-done', 'r-failed']) {
    await writeRun(runs, { id, action: 'review', status: 'delivering', attempts: 1, target: { kind: 'pr', repo: 'a/b', number: 1 }, source: { intake: 'poll' }, created_at: 't', updated_at: 't' });
    await exec('git', ['-C', clone, 'worktree', 'add', '--quiet', '--detach', join(runs, id, 'target'), 'HEAD']);
  }
  await finishRun(runs, 'r-done', 'done');
  await finishRun(runs, 'r-failed', 'failed', 'specialist crashed');
  await assert.rejects(access(join(runs, 'r-done', 'target')));
  await access(join(runs, 'r-failed', 'target'));
  const { stdout } = await exec('git', ['-C', clone, 'worktree', 'list']);
  assert.doesNotMatch(stdout, /r-done/);
  assert.match(stdout, /r-failed/);
  await removeTree(tmp);
});

test('finishRun done removes work/ even with a read-only Go module cache, records what it removed, keeps the review', async () => {
  const kept = ['review.md', 'posted.md', 'findings/security.yaml', 'prompts/security.md', 'plan.json', 'meta/pr.json'];
  const runs = await makeTree({ 'r-go/work/testing/gopath/pkg/mod/x@v1/a.go': 'package x', 'r-go/work/security/notes': 'n', ...Object.fromEntries(kept.map((k) => [`r-go/${k}`, 'x'])) });
  await writeRun(runs, { id: 'r-go', action: 'review', status: 'delivering', attempts: 1, target: { kind: 'pr', repo: 'a/b', number: 1 }, source: { intake: 'poll' }, created_at: 't', updated_at: 't' });
  await exec('chmod', ['-R', 'a-w', join(runs, 'r-go', 'work', 'testing', 'gopath', 'pkg', 'mod')]);
  await finishRun(runs, 'r-go', 'done');
  await assert.rejects(access(join(runs, 'r-go', 'work')));
  for (const k of [...kept, 'run.json']) await access(join(runs, 'r-go', k));
  const index = (await readFile(join(runs, 'index.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(index.find((e) => e.event === 'cleaned')?.removed, ['work/security', 'work/testing']);
  await removeTree(runs);
});

const running = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const startSleep = (cwd: string) => { const c = spawn('sleep', ['300'], { cwd, detached: true, stdio: 'ignore' }); c.unref(); return c.pid!; };

test('finishRun stops processes left under the run, done or failed, and records them; other runs untouched', { skip: process.platform !== 'linux' }, async () => {
  const runs = await makeTree({ 'r1/work/testing/x': 'x', 'r2/work/testing/x': 'x', 'r10/work/testing/x': 'x' });
  for (const id of ['r1', 'r2', 'r10']) await writeRun(runs, { id, action: 'review', status: 'delivering', attempts: 1, target: { kind: 'pr', repo: 'a/b', number: 1 }, source: { intake: 'poll' }, created_at: 't', updated_at: 't' });
  const byCwd = startSleep(join(runs, 'r1', 'work', 'testing'));
  const failedRun = startSleep(join(runs, 'r2', 'work', 'testing'));
  const otherRun = startSleep(join(runs, 'r10', 'work', 'testing'));
  await finishRun(runs, 'r1', 'done');
  await finishRun(runs, 'r2', 'failed', 'x');
  assert.equal(running(byCwd), false);
  assert.equal(running(failedRun), false);
  assert.equal(running(otherRun), true);
  await access(join(runs, 'r2', 'work', 'testing', 'x'));
  const index = (await readFile(join(runs, 'index.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(index.filter((e) => e.event === 'stopped').map((e) => [e.run, e.processes[0].pid, e.processes[0].cmd]), [['r1', byCwd, 'sleep 300'], ['r2', failedRun, 'sleep 300']]);
  assert.deepEqual((await stopRunProcesses(join(runs, 'r10'))).map((p) => p.pid), [otherRun]);
  await removeTree(runs);
});

test('removeWork unlinks a symlinked work/ without following it', async () => {
  const tmp = await makeTree({ 'outside/keep': 'k', 'run/review.md': 'r' });
  await symlink(join(tmp, 'outside'), join(tmp, 'run', 'work'));
  assert.deepEqual(await removeWork(join(tmp, 'run')), ['work']);
  await access(join(tmp, 'outside', 'keep'));
  await access(join(tmp, 'run', 'review.md'));
  await removeTree(tmp);
});

test('cleanRetired drops target trees of retired runs only; statusSummary counts', async () => {
  const runs = await makeTree({ 'r1/target/x': 'x', 'r2/target/y': 'y' });
  await writeRun(runs, { id: 'r1', action: 'review', status: 'done', attempts: 1, target: { kind: 'pr', repo: 'a/b', number: 1 }, source: { intake: 'poll' }, created_at: 't1', updated_at: 't1', retired: { at: 't', state: 'MERGED' } });
  await writeRun(runs, { id: 'r2', action: 'review', status: 'reviewing', attempts: 1, target: { kind: 'local', path: '/p', ref: 'main' }, source: { intake: 'agent-link' }, created_at: 't2', updated_at: 't2' });
  assert.deepEqual(await cleanRetired(runs), ['r1']);
  await access(join(runs, 'r2', 'target'));
  const s = await statusSummary(runs);
  assert.equal(s.counts.done, 1);
  assert.equal(s.counts.reviewing, 1);
  assert.deepEqual(s.inFlight.map((r) => r.id), ['r2']);
  assert.equal(s.recent[0]?.target, 'local /p');
  await removeTree(runs);
});
