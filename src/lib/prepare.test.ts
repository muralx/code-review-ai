import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { newRun } from './lifecycle.ts';
import { prepareRun } from './prepare.ts';
import { readRun } from './runs.ts';
import type { Config } from './types.ts';

const exec = promisify(execFile);
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const COMPANY = join(ROOT, 'tests/fixtures/company-acme');
const config: Config = { models: { specialist: { model: 'claude-opus-5-5', effort: 'high' }, merger: { model: 'claude-sonnet-5-5', effort: 'medium' } } };

async function fixtures() {
  const tmp = await makeTree({});
  const fix = join(tmp, 'fixtures'); const bin = join(tmp, 'bin');
  await mkdir(fix);
  const { stdout } = await exec('bash', ['-c', `source "${ROOT}/tests/helpers/fixture-repo.sh"; make_remote "${fix}" acme widgets; make_remote "${fix}" acme widgets-sdk >/dev/null; make_remote "${fix}" acme private-tools >/dev/null; make_gh_stub "${fix}" "${bin}"`]);
  const [prSha] = stdout.trim().split('\n')[0]!.split(' ');
  const env = { ...process.env, PATH: `${bin}:${process.env['PATH']}`, GH_FIXTURES: fix };
  return { tmp, fix, env, prSha: prSha! };
}

test('PR run: prep → resolve → siblings → compose → dispatch, status reviewing', async () => {
  const { tmp, env, prSha } = await fixtures();
  const runsDir = join(tmp, 'runs'); const clonesDir = join(tmp, 'clones');
  const run = await newRun({ runsDir, request: { id: '', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 7 }, context: 'focus on B' }, source: { intake: 'agent-link', conversation_id: 'cv_1', from: 'builder' } });
  const r = await prepareRun({ runsDir, id: run.id, clonesDir, companyDir: COMPANY, frameworkDir: ROOT, config, env });
  assert.equal(r.blocked, false);
  if (r.blocked) return;
  assert.deepEqual(r.dispatch.specialists.map((s) => [s.type, s.model, s.effort]), [['security', 'opus', 'xhigh'], ['testing', 'opus', 'high'], ['code-structure', 'opus', 'high']]);
  assert.deepEqual(r.dispatch.merger, { output: join(runsDir, run.id, 'review.md'), model: 'sonnet', effort: 'medium' });
  assert.equal(r.dispatch.posting.form, 'comment');
  assert.deepEqual(r.dispatch.notify, { intake: 'agent-link', conversation_id: 'cv_1', from: 'builder' });
  const prompt = await readFile(join(runsDir, run.id, 'prompts', 'security.md'), 'utf8');
  assert.match(prompt, /Acme Go security checklist/);          // the company's security template, languages from the manifest
  assert.doesNotMatch(prompt, /crypto\/rand only.*\n[\s\S]*Go security amendment/, 'framework go list not included by the company template');
  assert.match(prompt, /focus on B/);
  assert.match(prompt, /Pull request acme\/widgets#7: PR seven/);
  assert.match(prompt, /Sibling repositories \(read-only\):\n- .*acme-widgets-sdk/);
  await access(join(runsDir, run.id, 'prompts', 'security.resolution.json'));
  const saved = await readRun(join(runsDir, run.id));
  assert.equal(saved.status, 'reviewing');
  assert.equal(saved.identity, prSha);
  assert.deepEqual(saved.types, ['security', 'testing', 'code-structure']);
  assert.equal(saved.target.kind === 'pr' && saved.target.head_sha, prSha);
  await removeTree(tmp);
});

test('local run with a prior review gets prior_review in the task; never+post:true ends blocked', async () => {
  const { tmp, fix, env } = await fixtures();
  const runsDir = join(tmp, 'runs'); const clonesDir = join(tmp, 'clones');
  const src = join(tmp, 'dev', 'widgets');
  await exec('git', ['clone', '-q', join(fix, 'acme-widgets.git'), src]);
  await writeFile(join(src, 'README.md'), 'edited\n');
  await mkdir(join(runsDir, 'prior'), { recursive: true });
  await writeFile(join(runsDir, 'prior', 'review.md'), '---\nrun: prior\n---\n```yaml\n[]\n```\nNON-BLOCKING\n');
  const run = await newRun({ runsDir, request: { id: '', action: 'rereview', target: { kind: 'local', path: src } }, source: { intake: 'agent-link' }, prior_run: 'prior' });
  const r = await prepareRun({ runsDir, id: run.id, clonesDir, companyDir: COMPANY, frameworkDir: ROOT, config, env });
  assert.equal(r.blocked, false);
  if (r.blocked) return;
  assert.equal(r.dispatch.priorReview, join(runsDir, 'prior', 'review.md'));
  assert.equal(r.dispatch.posting.post, false);
  const task = JSON.parse(await readFile(join(runsDir, run.id, 'prompts', 'security.task.json'), 'utf8'));
  assert.equal(task.prior_review, join(runsDir, 'prior', 'review.md'));
  assert.equal(task.target_kind, 'local');
  const prompt = await readFile(join(runsDir, run.id, 'prompts', 'security.md'), 'utf8');
  assert.match(prompt, /Re-review discipline/);

  const blocked = await newRun({ runsDir, request: { id: '', action: 'review', target: { kind: 'pr', repo: 'acme/private-tools', number: 7 }, post: true }, source: { intake: 'agent-link' } });
  const b = await prepareRun({ runsDir, id: blocked.id, clonesDir, companyDir: COMPANY, frameworkDir: ROOT, config, env });
  assert.equal(b.blocked, true);
  assert.equal((await readRun(join(runsDir, blocked.id))).status, 'blocked');
  await removeTree(tmp);
});

test('a failing prep-target marks the run failed with the reason', async () => {
  const { tmp, env } = await fixtures();
  const runsDir = join(tmp, 'runs');
  const run = await newRun({ runsDir, request: { id: '', action: 'review', target: { kind: 'local', path: join(tmp, 'nowhere') } }, source: { intake: 'poll' } });
  await assert.rejects(prepareRun({ runsDir, id: run.id, clonesDir: join(tmp, 'clones'), companyDir: null, frameworkDir: ROOT, config, env }), /prep-target local failed/);
  const saved = await readRun(join(runsDir, run.id));
  assert.equal(saved.status, 'failed');
  assert.match(saved.failure ?? '', /not inside a git working tree/);
  await removeTree(tmp);
});
