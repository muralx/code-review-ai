import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';

const run = promisify(execFile);
const CLI = new URL('./compose-prompt.ts', import.meta.url).pathname;

test('compose-prompt writes the prompt and resolution files', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': '${framework}/guidelines/types/${type}/general.md\n${task}\n', 'guidelines/types/testing/general.md': 'Test rules' });
  const work = await makeTree({
    'task.json': JSON.stringify({
      run_id: 'r', target_kind: 'audit', repo: 'acme/w', ref: 'main', target_dir: '/t', meta_dir: '/m',
      files_path: '/m/files.json', siblings: [], prior_review: null, output_path: '/o.md', frontmatter: { run: 'r' },
    }),
  });
  await run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI,
    '--type', 'testing', '--kind', 'library', '--lang', 'ts',
    '--framework', fw, '--task', join(work, 'task.json'),
    '--out', join(work, 'prompts/testing.md'), '--resolution', join(work, 'resolution.json')]);
  const prompt = await readFile(join(work, 'prompts/testing.md'), 'utf8');
  assert.match(prompt, /Test rules/);
  const res = JSON.parse(await readFile(join(work, 'resolution.json'), 'utf8'));
  assert.equal(res.type, 'testing');
  assert.equal(res.targetKind, 'audit');
  assert.equal(res.template, '${framework}/prompts/specialist.md');
  await removeTree(fw); await removeTree(work);
});

test('usage error exits 2', async () => {
  await assert.rejects(run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI, '--type', 'testing']), (e: { code: number; stderr: string }) => e.code === 2 && /--kind is required/.test(e.stderr));
});

test('unknown type exits 2', async () => {
  const fw = await makeTree({});
  await assert.rejects(run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI, '--type', 'vibes', '--kind', 'tool', '--framework', fw, '--task', '/none', '--out', '/none']), (e: { code: number; stderr: string }) => e.code === 2 && /unknown review type/.test(e.stderr));
  await removeTree(fw);
});

test('a repo template is refused with exit 2', async () => {
  const fw = await makeTree({});
  await assert.rejects(run(process.execPath, ['--no-warnings=ExperimentalWarning', CLI, '--type', 'testing', '--kind', 'tool', '--template', '${repo}/x.md', '--framework', fw, '--task', '/none', '--out', '/none']), (e: { code: number; stderr: string }) => e.code === 2 && /--template must be/.test(e.stderr));
  await removeTree(fw);
});
