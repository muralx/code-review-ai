import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';

const run = promisify(execFile);
const CLI = new URL('./cra.ts', import.meta.url).pathname;
const cra = (dep: string, ...args: string[]) => run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI, '--deployment', dep, ...args]);

test('run new → show → usage → finish; status renders a table', async () => {
  const dep = await makeTree({ 'config.yaml': 'models:\n  specialist: { model: claude-opus-5-5 }\n', 'request.json': JSON.stringify({ action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 7 }, types: ['security'] }) });
  const { stdout: idOut } = await cra(dep, 'run', 'new', '--request', join(dep, 'request.json'), '--intake', 'agent-link', '--from', 'builder', '--conversation', 'cv_9');
  const id = idOut.trim();
  assert.match(id, /-acme-widgets-7$/);
  const shown = JSON.parse((await cra(dep, 'run', 'show', id)).stdout);
  assert.equal(shown.run.status, 'queued');
  assert.deepEqual(shown.run.source, { intake: 'agent-link', conversation_id: 'cv_9', from: 'builder' });
  assert.equal(shown.dispatch, null);
  await cra(dep, 'run', 'usage', id, '--type', 'security', '--input', '1200', '--output', '300');
  const saved = JSON.parse(await readFile(join(dep, 'runs', id, 'run.json'), 'utf8'));
  assert.deepEqual(saved.usage, { security: { input: 1200, output: 300 } });
  const fin = JSON.parse((await cra(dep, 'run', 'finish', id, '--outcome', 'failed', '--failure', 'no specialists')).stdout);
  assert.equal(fin.status, 'failed');
  const { stdout: status } = await cra(dep, 'status');
  assert.match(status, /\| failed \| 1 \|/);
  assert.match(status, /acme\/widgets#7/);
  await removeTree(dep);
});

test('from-candidate creates a poll-intake run with attempts and head sha', async () => {
  const dep = await makeTree({});
  await writeFile(join(dep, 'c.json'), JSON.stringify({ action: 'rereview', repo: 'acme/widgets', number: 8, head_sha: 'abc', title: 't', url: 'u', base: 'main', reason: 'retry', retry_of: 'r1', prior_run: 'r0', attempts: 2 }));
  const id = (await cra(dep, 'run', 'from-candidate', '--candidate', join(dep, 'c.json'))).stdout.trim();
  const saved = JSON.parse(await readFile(join(dep, 'runs', id, 'run.json'), 'utf8'));
  assert.equal(saved.attempts, 2);
  assert.equal(saved.retry_of, 'r1');
  assert.equal(saved.prior_run, 'r0');
  assert.equal(saved.target.head_sha, 'abc');
  assert.equal(saved.source.intake, 'poll');
  await removeTree(dep);
});

test('usage errors exit 2', async () => {
  const dep = await makeTree({});
  await assert.rejects(cra(dep, 'run', 'new'), (e: { code: number }) => e.code === 2);
  await assert.rejects(cra(dep, 'bogus'), (e: { code: number }) => e.code === 2);
  await assert.rejects(cra(dep, 'run', 'finish', 'x', '--outcome', 'maybe'), (e: { code: number }) => e.code === 2);
  await removeTree(dep);
});

test('init renders a deployment and refuses to run twice; update re-renders', async () => {
  const tmp = await makeTree({});
  const company = new URL('../../tests/fixtures/company-acme', import.meta.url).pathname;
  const { stdout } = await cra(tmp, 'init', '--dir', join(tmp, 'acme'), '--company', company, '--link', '--workspace', 'acme-dev', '--poll', '5');
  assert.match(stdout, /deployment written/);
  const claudeMd = await readFile(join(tmp, 'acme', 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /\*\/5 \* \* \* \*/);
  await assert.rejects(cra(tmp, 'init', '--dir', join(tmp, 'acme'), '--company', company, '--link', '--workspace', 'acme-dev'), /already a deployment/);
  const { stdout: up } = await cra(tmp, 'update', '--dir', join(tmp, 'acme'));
  assert.match(up, /re-rendered/);
  await removeTree(tmp);
});
