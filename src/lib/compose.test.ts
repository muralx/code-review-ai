import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { compose, parseRef, tidy, type ComposeInput } from './compose.ts';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import type { Roots } from './types.ts';
import type { TaskInput } from './task-block.ts';

const task: TaskInput = {
  run_id: 'r1', target_kind: 'pr', repo: 'acme/widgets',
  pr: { number: 1, url: 'u', title: 't', base: 'main', head_sha: 'sha' },
  target_dir: '/t', work_dir: '/w', meta_dir: '/m', diff_path: '/m/diff.patch', files_path: '/m/files.json',
  siblings: [], prior_review: null, output_path: '/out.md', frontmatter: { run: 'r1' },
};

function input(roots: Partial<Roots> & { framework: string }, extra: Partial<ComposeInput> = {}): ComposeInput {
  return {
    template: '${framework}/prompts/specialist.md',
    roots: { company: null, project: null, repo: null, ...roots },
    type: 'security', kind: 'service', languages: ['go'], targetKind: 'pr', task, ...extra,
  };
}

const TEMPLATE = [
  '# Review instructions: ${type}', '',
  '## Identity', '', '${framework}/agents/types/${type}.md', '${company}/agents/types/${type}.md?', '',
  '## Common policy', '', '${framework}/guidelines/common/*.md', '',
  '## Guidelines for ${type}', '',
  '${framework}/guidelines/types/${type}/general.md',
  '${framework}/guidelines/types/${type}/kind/${kind}.md?',
  '${framework}/guidelines/types/${type}/lang/${lang}.md?', '',
  '## Project guidelines', '', '${project}/${type}.md?', '',
  '## Repository guidelines', '', '${repo}/${type}.md?', '',
  '${task}', '',
].join('\n');

test('parseRef recognises include lines only', () => {
  assert.deepEqual(parseRef('${company}/a/b.md?'), { root: 'company', rel: 'a/b.md', optional: true });
  assert.deepEqual(parseRef('  ${framework}/x.md  '), { root: 'framework', rel: 'x.md', optional: false });
  assert.equal(parseRef('see ${company}/a.md for details'), null);
  assert.equal(parseRef('${elsewhere}/a.md'), null);
});

test('the framework template expands in order with provenance lines, variables and the task block', async () => {
  const fw = await makeTree({
    'prompts/specialist.md': TEMPLATE,
    'agents/types/security.md': 'You are the security reviewer.',
    'guidelines/common/10-severity.md': 'Severity rules.',
    'guidelines/common/20-triage.md': 'Triage rules.',
    'guidelines/types/security/general.md': 'General security.',
    'guidelines/types/security/kind/service.md': 'Service security.',
    'guidelines/types/security/lang/go.md': 'Go security.',
    'guidelines/types/security/lang/ts.md': 'TS security.',
  });
  const r = await compose(input({ framework: fw }, { languages: ['go', 'ts'] }));
  const idx = (s: string) => { const i = r.prompt.indexOf(s); assert.notEqual(i, -1, `missing ${s}`); return i; };
  assert.ok(r.prompt.startsWith('# Review instructions: security\n'));
  assert.ok(idx('## Identity') < idx('*${framework}/agents/types/security.md*'));
  assert.ok(idx('*${framework}/agents/types/security.md*') < idx('You are the security reviewer.'));
  assert.ok(idx('Severity rules.') < idx('Triage rules.'));
  assert.ok(idx('## Guidelines for security') < idx('General security.'));
  assert.ok(idx('General security.') < idx('Service security.'));
  assert.ok(idx('Service security.') < idx('Go security.'));
  assert.ok(idx('Go security.') < idx('TS security.'));
  assert.ok(idx('TS security.') < idx('## Task'));
  assert.doesNotMatch(r.prompt, /## Project guidelines|## Repository guidelines/, 'empty headings are dropped');
  assert.doesNotMatch(r.prompt, /^\$\{/m, 'no unexpanded include lines');
  const used = r.resolution.files.filter((f) => f.used).map((f) => f.ref);
  assert.deepEqual(used, [
    '${framework}/prompts/specialist.md',
    '${framework}/agents/types/security.md',
    '${framework}/guidelines/common/10-severity.md',
    '${framework}/guidelines/common/20-triage.md',
    '${framework}/guidelines/types/security/general.md',
    '${framework}/guidelines/types/security/kind/service.md',
    '${framework}/guidelines/types/security/lang/go.md',
    '${framework}/guidelines/types/security/lang/ts.md',
  ]);
  const absent = r.resolution.files.filter((f) => !f.used);
  assert.deepEqual(absent.map((f) => [f.ref, f.reason]), [
    ['${company}/agents/types/security.md', 'no-root'],
    ['${project}/security.md', 'no-root'],
    ['${repo}/security.md', 'no-root'],
  ]);
  assert.ok(r.resolution.files.every((f) => !f.used || typeof f.sha256 === 'string'));
  await removeTree(fw);
});

test('company, project and repo files are included where the template says; an included file may include further files', async () => {
  const fw = await makeTree({
    'prompts/specialist.md': TEMPLATE,
    'agents/types/security.md': 'FW identity',
    'guidelines/types/security/general.md': 'FW general',
  });
  const co = await makeTree({
    'agents/types/security.md': 'CO identity extra',
    'guidelines/shared/db.md': 'Shared db note',
  });
  const pr = await makeTree({ 'security.md': 'Project security' });
  const repo = await makeTree({ 'security.md': 'Repo security\n\n${company}/guidelines/shared/db.md\n' });
  const r = await compose(input({ framework: fw, company: co, project: pr, repo }));
  assert.match(r.prompt, /FW identity[\s\S]*\*\$\{company\}\/agents\/types\/security\.md\*\n\nCO identity extra/);
  assert.match(r.prompt, /## Project guidelines\n\n\*\$\{project\}\/security\.md\*\n\nProject security/);
  assert.match(r.prompt, /## Repository guidelines\n\n\*\$\{repo\}\/security\.md\*\n\nRepo security\n\n\*\$\{company\}\/guidelines\/shared\/db\.md\*\n\nShared db note/);
  const nested = r.resolution.files.find((f) => f.ref === '${company}/guidelines/shared/db.md');
  assert.equal(nested?.includedBy, '${repo}/security.md');
  for (const d of [fw, co, pr, repo]) await removeTree(d);
});

test('a company template replaces the framework one entirely', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': TEMPLATE, 'guidelines/types/security/general.md': 'FW general' });
  const co = await makeTree({ 'prompts/security.md': '# Ours\n\n${company}/checklist.md\n\n${task}\n', 'checklist.md': 'CO checklist' });
  const r = await compose(input({ framework: fw, company: co }, { template: '${company}/prompts/security.md' }));
  assert.doesNotMatch(r.prompt, /FW general/);
  assert.match(r.prompt, /^# Ours\n\n\*\$\{company\}\/checklist\.md\*\n\nCO checklist\n\n## Task/);
  assert.equal(r.resolution.template, '${company}/prompts/security.md');
  await removeTree(fw); await removeTree(co);
});

test('a required include that is missing fails; an optional one is recorded as absent', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': '${framework}/missing.md\n' });
  await assert.rejects(compose(input({ framework: fw })), /\$\{framework\}\/missing\.md \(in \$\{framework\}\/prompts\/specialist\.md\): file not found/);
  const fw2 = await makeTree({ 'prompts/specialist.md': '${framework}/missing.md?\n${company}/x.md\n' });
  await assert.rejects(compose(input({ framework: fw2 })), /no company directory/);
  const fw3 = await makeTree({ 'prompts/specialist.md': 'text\n${framework}/missing.md?\n${company}/x.md?\n${company}/dir/*.md\n' });
  const r = await compose(input({ framework: fw3 }));
  assert.equal(r.prompt, 'text\n');
  assert.deepEqual(r.resolution.files.filter((f) => !f.used).map((f) => f.reason), ['absent', 'no-root', 'no-root']);
  for (const d of [fw, fw2, fw3]) await removeTree(d);
});

test('a template may not come from the repo root and includes may not escape their root', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': '${framework}/../outside.md\n', 'outside.md': 'x' });
  const repo = await makeTree({ 't.md': 'x' });
  await assert.rejects(compose(input({ framework: fw, repo }, { template: '${repo}/t.md' })), /template must be/);
  await assert.rejects(compose(input({ framework: join(fw, 'prompts'), repo }, { template: '${framework}/specialist.md' })), /escapes its root/);
  await removeTree(fw); await removeTree(repo);
});

test('a symlink pointing outside the root is refused', async () => {
  const outside = await makeTree({ 'secret.md': 'SECRET' });
  const fw = await makeTree({ 'prompts/specialist.md': '${repo}/notes.md?\n' });
  const repo = await makeTree({});
  await symlink(join(outside, 'secret.md'), join(repo, 'notes.md'));
  await assert.rejects(compose(input({ framework: fw, repo })), /escapes its root/);
  for (const d of [outside, fw, repo]) await removeTree(d);
});

test('include cycles and excessive depth are errors', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': '${framework}/a.md\n', 'a.md': '${framework}/b.md\n', 'b.md': '${framework}/a.md\n' });
  await assert.rejects(compose(input({ framework: fw })), /include cycle/);
  await removeTree(fw);
});

test('applies_to keeps a file out of other target kinds and is recorded', async () => {
  const fw = await makeTree({
    'prompts/specialist.md': '${framework}/guidelines/common/*.md\n',
    'guidelines/common/30-rereview.md': '---\napplies_to: [pr, local]\n---\nRe-review rules',
  });
  const pr = await compose(input({ framework: fw }, { targetKind: 'pr' }));
  assert.match(pr.prompt, /Re-review rules/);
  const audit = await compose(input({ framework: fw }, { targetKind: 'audit', task: { ...task, target_kind: 'audit', pr: undefined, diff_path: undefined, ref: 'main' } }));
  assert.doesNotMatch(audit.prompt, /Re-review rules/);
  assert.equal(audit.resolution.files.find((f) => f.ref.endsWith('30-rereview.md'))?.reason, 'applies_to');
  await removeTree(fw);
});

test('globs are confined to the last segment and never required', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': '${framework}/*/x.md\n' });
  await assert.rejects(compose(input({ framework: fw })), /only allowed in the last path segment/);
  await removeTree(fw);
});

test('tidy drops empty headings at any level and collapses blank runs', () => {
  const out = tidy(['# T', '', '## A', '', '### A1', '', '## B', '', 'text', '', '', '## C', '']);
  assert.equal(out, '# T\n\n## B\n\ntext\n');
});

test('same input gives identical bytes', async () => {
  const fw = await makeTree({ 'prompts/specialist.md': TEMPLATE, 'agents/types/security.md': 'x', 'guidelines/types/security/general.md': 'y' });
  const a = await compose(input({ framework: fw }));
  const b = await compose(input({ framework: fw }));
  assert.equal(a.prompt, b.prompt);
  assert.equal(a.resolution.output.sha256, b.resolution.output.sha256);
  await removeTree(fw);
});
