import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { installGhStub, withEnv, type GhResponse } from '../../tests/helpers/gh-stub.ts';
import { discover, REQUESTED_SEARCH } from './discover.ts';
import { writeRun, type RunRecord } from './runs.ts';

const REPO = 'acme/widgets';
const pr = (n: number, sha: string, extra: Record<string, unknown> = {}) =>
  ({ number: n, headRefOid: sha, title: `PR ${n}`, url: `https://x/${n}`, baseRefName: 'main', isDraft: false, author: { login: 'dev' }, state: 'OPEN', ...extra });
const listResp = (items: unknown[]): GhResponse => ({ match: `pr list --repo ${REPO} --search ${REQUESTED_SEARCH}`, stdout: JSON.stringify(items) });
const repoResp: GhResponse = { match: `api repos/${REPO}`, stdout: `${REPO}\n` };
const viewResp = (n: number, item: unknown, exit = 0): GhResponse => ({ match: `pr view ${n} --repo ${REPO}`, stdout: exit ? '' : JSON.stringify(item), exit, stderr: exit ? 'boom' : '' });

function run(id: string, n: number, sha: string, extra: Partial<RunRecord> = {}): RunRecord {
  return {
    id, action: 'review', status: 'done', attempts: 1, target: { kind: 'pr', repo: REPO, number: n, head_sha: sha }, identity: sha,
    source: { intake: 'poll' }, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z', ...extra,
  };
}

async function scenario(runs: RunRecord[], responses: GhResponse[]) {
  const runsDir = await makeTree({});
  for (const r of runs) await writeRun(runsDir, r);
  const stub = await installGhStub([...responses, repoResp]);
  const result = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir }));
  await removeTree(runsDir);
  return { result, stub };
}

test('fresh requested PR becomes a review', async () => {
  const { result } = await scenario([], [listResp([pr(7, 'aaa')])]);
  assert.deepEqual(result.candidates, [{ action: 'review', repo: REPO, number: 7, head_sha: 'aaa', title: 'PR 7', url: 'https://x/7', base: 'main', reason: 'requested', attempts: 1 }]);
});

test('requested PR with a posted done run is a re-request even with the same SHA', async () => {
  const { result } = await scenario([run('r1', 7, 'aaa', { delivery: { posted_sha: 'aaa', verdict: 'approve' } })], [listResp([pr(7, 'aaa')])]);
  assert.equal(result.candidates[0]?.reason, 're-requested');
  assert.equal(result.candidates[0]?.action, 'rereview');
  assert.equal(result.candidates[0]?.prior_run, 'r1');
});

test('requested PR with a done run but no posted_sha (posting never) does not loop', async () => {
  const { result, stub } = await scenario([run('r1', 7, 'aaa')], [listResp([pr(7, 'aaa')]), viewResp(7, pr(7, 'aaa'))]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.skipped, [{ repo: REPO, number: 7, reason: 'unchanged' }]);
  assert.equal((await stub.calls()).filter((c) => !c[1]?.includes('/commits/')).length, 2);
});

test('requested PR with new commits is re-reviewed; in-flight and blocked runs are skipped', async () => {
  const { result } = await scenario(
    [run('r1', 7, 'aaa'), run('r2', 8, 'bbb', { status: 'reviewing' }), run('r3', 9, 'ccc', { status: 'blocked' })],
    [listResp([pr(7, 'aab')]), viewResp(7, pr(7, 'aab')), viewResp(8, pr(8, 'bbc')), viewResp(9, pr(9, 'ccd'))],
  );
  assert.deepEqual(result.candidates.map((c) => [c.number, c.reason, c.prior_run]), [[7, 'new-commits', 'r1']]);
  assert.deepEqual(result.skipped, [{ repo: REPO, number: 8, reason: 'in-flight' }, { repo: REPO, number: 9, reason: 'in-flight' }]);
});

test('new commits on a PR that no longer requests the bot are not reviewed', async () => {
  const { result } = await scenario([run('r1', 7, 'aaa', { delivery: { posted_sha: 'aaa', verdict: 'request-changes' } })], [listResp([]), viewResp(7, pr(7, 'aab'))]);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.skipped, [{ repo: REPO, number: 7, reason: 'not-requested' }]);
});

test('a requested head younger than the settle time waits; an older one is reviewed', async () => {
  const runsDir = await makeTree({});
  await writeRun(runsDir, run('r1', 8, 'bbb'));
  const now = new Date('2026-10-19T12:00:00Z');
  const date = (sha: string, at: string): GhResponse => ({ match: `api repos/${REPO}/commits/${sha}`, stdout: `${at}\n` });
  const stub = await installGhStub([listResp([pr(7, 'aaa'), pr(8, 'bbc'), pr(9, 'ccc')]), date('aaa', '2026-10-19T11:58:00Z'), date('bbc', '2026-10-19T11:59:00Z'), date('ccc', '2026-10-19T11:54:00Z'), repoResp]);
  const result = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir, now }));
  assert.deepEqual(result.candidates.map((c) => [c.number, c.reason]), [[9, 'requested']]);
  assert.deepEqual(result.skipped.map((s) => [s.number, s.reason]), [[7, 'settling'], [8, 'settling']]);
  const calls = await stub.calls();
  assert.equal(calls.filter((c) => c[1] === 'view').length, 0);
  assert.ok(calls.every((c) => !c.join(' ').includes('commits,') && !c.includes('number,headRefOid,title,url,baseRefName,isDraft,author,commits')));
  await removeTree(runsDir);
});

test('failed run is retried once as a new attempt (carrying its prior_run), then left alone', async () => {
  const { result } = await scenario(
    [run('r1', 7, 'aaa', { status: 'failed', action: 'rereview', prior_run: 'r0' }), run('r2', 8, 'bbb', { status: 'failed', attempts: 2 })],
    [listResp([]), viewResp(7, pr(7, 'aaa')), viewResp(8, pr(8, 'bbb'))],
  );
  assert.deepEqual(result.candidates.map((c) => [c.number, c.reason, c.retry_of, c.attempts, c.action, c.prior_run]), [[7, 'retry', 'r1', 2, 'rereview', 'r0']]);
  assert.deepEqual(result.skipped, [{ repo: REPO, number: 8, reason: 'retried' }]);
});

test('new commits after a failed first review is a plain review; after a failed rereview the prior carries over', async () => {
  const { result } = await scenario(
    [run('r1', 7, 'aaa', { status: 'failed' }), run('r2', 8, 'bbb', { status: 'failed', action: 'rereview', prior_run: 'r0' })],
    [listResp([pr(7, 'aab'), pr(8, 'bbc')]), viewResp(7, pr(7, 'aab')), viewResp(8, pr(8, 'bbc'))],
  );
  assert.deepEqual(result.candidates.map((c) => [c.number, c.action, c.reason, c.prior_run]), [[7, 'review', 'new-commits', undefined], [8, 'rereview', 'new-commits', 'r0']]);
});

test('retired PRs are recorded in run.json and the index, and never re-checked', async () => {
  const runsDir = await makeTree({});
  await writeRun(runsDir, run('r1', 7, 'aaa'));
  const stub = await installGhStub([listResp([]), repoResp, viewResp(7, pr(7, 'aaa', { state: 'MERGED' }))]);
  const first = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir }));
  assert.deepEqual(first.retired, [{ repo: REPO, number: 7, run: 'r1', state: 'MERGED' }]);
  const saved = JSON.parse(await (await import('node:fs/promises')).readFile(`${runsDir}/r1/run.json`, 'utf8'));
  assert.equal(saved.retired.state, 'MERGED');
  const index = await (await import('node:fs/promises')).readFile(`${runsDir}/index.jsonl`, 'utf8');
  assert.match(index, /"event":"retired"/);
  const second = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir }));
  assert.deepEqual(second.retired, []);
  assert.equal((await stub.calls()).filter((c) => c[0] === 'pr' && c[1] === 'view').length, 1);
  await removeTree(runsDir);
});

test('merged or closed PRs are retired; drafts and bots skipped; gh errors recorded', async () => {
  const { result } = await scenario(
    [run('r1', 7, 'aaa'), run('r2', 8, 'bbb'), run('r3', 9, 'ccc'), run('r4', 10, 'ddd')],
    [listResp([pr(11, 'eee', { author: { login: 'dependabot', is_bot: true } })]), viewResp(7, pr(7, 'aaa', { state: 'MERGED' })), viewResp(8, pr(8, 'bbb', { isDraft: true })), viewResp(9, pr(9, 'ccc', { author: { is_bot: true } })), viewResp(10, {}, 1)],
  );
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.retired, [{ repo: REPO, number: 7, run: 'r1', state: 'MERGED' }]);
  assert.deepEqual(result.skipped.map((s) => [s.number, s.reason.split(':')[0]]), [[8, 'draft'], [9, 'bot'], [10, 'gh-error']]);
});

test('runs for repos not in the config are ignored; list failure is recorded', async () => {
  const runsDir = await makeTree({});
  await writeRun(runsDir, run('r1', 7, 'aaa', { target: { kind: 'pr', repo: 'other/repo', number: 7, head_sha: 'aaa' } }));
  const stub = await installGhStub([{ match: 'pr list', exit: 1, stderr: 'rate limited' }]);
  const result = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir }));
  assert.deepEqual(result.candidates, []);
  assert.equal(result.skipped[0]?.reason.startsWith('gh-error'), true);
  assert.equal((await stub.calls()).length, 1);
  await removeTree(runsDir);
});

test('a repository the token cannot read is reported, not treated as having no requests', async () => {
  const runsDir = await makeTree({});
  const stub = await installGhStub([listResp([]), { match: `api repos/${REPO}`, exit: 1, stderr: 'gh: Not Found (HTTP 404)' }]);
  const result = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir }));
  assert.deepEqual(result.candidates, []);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0]?.repo, REPO);
  assert.match(result.skipped[0]?.reason ?? '', /^unreadable: .*Not Found/);
  await removeTree(runsDir);
});

test('polling off: nothing is listed or started', async () => {
  const runsDir = await makeTree({});
  const stub = await installGhStub([]);
  const result = await withEnv(stub.env, () => discover({ repos: [REPO], runsDir, polling: false }));
  assert.deepEqual(result, { candidates: [], retired: [], skipped: [{ repo: '*', number: 0, reason: 'polling off (CRA_POLL=off)' }] });
  assert.deepEqual(await stub.calls(), []);
  await removeTree(runsDir);
});
