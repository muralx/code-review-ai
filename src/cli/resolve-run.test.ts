import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';

const run = promisify(execFile);
const CLI = new URL('./resolve-run.ts', import.meta.url).pathname;
const company = new URL('../../tests/fixtures/company-acme', import.meta.url).pathname;

test('resolve-run writes plan.json', async () => {
  const work = await makeTree({
    'request.json': JSON.stringify({ id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 1 } }),
    'config.yaml': 'models:\n  specialist: { model: claude-opus-5-5, effort: high }\nlimits:\n  max_specialists_per_run: 7\n',
    'files.json': JSON.stringify(['a.go']),
  });
  await run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI,
    '--request', join(work, 'request.json'), '--config', join(work, 'config.yaml'),
    '--framework', '/fw', '--company', company, '--files', join(work, 'files.json'),
    '--out', join(work, 'plan.json')]);
  const plan = JSON.parse(await readFile(join(work, 'plan.json'), 'utf8'));
  assert.equal(plan.project.name, 'widgets');
  assert.equal(plan.posting.form, 'comment');
  await removeTree(work);
});

test('invalid request exits 2', async () => {
  const work = await makeTree({ 'request.json': JSON.stringify({ id: 'r', action: 'review', target: { kind: 'blimp' } }), 'config.yaml': '' });
  await assert.rejects(run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI, '--request', join(work, 'request.json'), '--config', join(work, 'config.yaml'), '--framework', '/fw', '--out', join(work, 'p.json')]),
    (e: { code: number; stderr: string }) => e.code === 2 && /target\.kind/.test(e.stderr));
  await removeTree(work);
});
