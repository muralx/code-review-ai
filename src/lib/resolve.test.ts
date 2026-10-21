import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRun, type ResolveInput } from './resolve.ts';

const FIX = new URL('../../tests/fixtures/', import.meta.url).pathname;
const company = FIX + 'company-acme';
const targetGuidelines = FIX + 'target-widgets/.code-review';

function input(partial: Partial<ResolveInput> = {}): ResolveInput {
  return {
    request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 1 } },
    config: { models: { specialist: { model: 'claude-opus-5-5', effort: 'high' } } },
    frameworkDir: '/fw', companyDir: company, targetGuidelinesDir: null, files: [],
    ...partial,
  };
}

test('project found by repo; languages from manifest; types in priority order with per-type overrides', async () => {
  const p = await resolveRun(input());
  assert.deepEqual(p.project, { name: 'widgets', source: 'project' });
  assert.equal(p.kind, 'library');
  assert.deepEqual(p.languages, ['go', 'ts']);
  assert.equal(p.languagesSource, 'manifest');
  assert.deepEqual(p.types.map((t) => t.name), ['security', 'testing', 'code-structure']);
  const sec = p.types.find((t) => t.name === 'security')!;
  assert.deepEqual(sec, { name: 'security', required: true, model: 'claude-opus-5-5', effort: 'xhigh', prompt: '${company}/prompts/security.md' });
  const cs = p.types.find((t) => t.name === 'code-structure')!;
  assert.deepEqual(cs, { name: 'code-structure', required: false, model: 'claude-opus-5-5', effort: 'high', prompt: '${framework}/prompts/specialist.md' });
  assert.deepEqual(p.siblings, ['acme/widgets-sdk']);
  assert.equal(p.roots.project, company + '/projects/widgets');
  assert.equal(p.roots.repo, null);
});

test('comment-only policy: posts a comment by default; request post:false respected', async () => {
  const a = await resolveRun(input());
  assert.deepEqual(a.posting, { policy: 'comment-only', post: true, form: 'comment', needsHuman: false, reason: 'project policy comment-only' });
  const b = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 1 }, post: false } }));
  assert.equal(b.posting.post, false);
});

test('never policy with post:true needs a human; company-required types come back when a project omits them', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/private-tools', number: 2 }, post: true } }));
  assert.equal(p.posting.policy, 'never');
  assert.equal(p.posting.post, false);
  assert.equal(p.posting.needsHuman, true);
  assert.deepEqual(p.types.map((t) => t.name), ['security', 'testing']);
  assert.deepEqual(p.addedRequired, ['testing']);
});

test('per-type config from company defaults is inherited by a project that lists the type bare', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/other', number: 3 } } }));
  const doc = p.types.find((t) => t.name === 'documentation')!;
  assert.deepEqual(doc, { name: 'documentation', required: false, model: 'claude-sonnet-5-5', effort: 'medium', prompt: '${framework}/prompts/specialist.md' });
});

test('audit never posts', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'audit', repo: 'acme/widgets', ref: 'main' } } }));
  assert.deepEqual(p.posting, { policy: 'comment-only', post: false, form: null, needsHuman: false, reason: 'not a pull request' });
});

test('request types narrow, required types come back, unknown types reported', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/widgets', number: 1 }, types: ['code-structure', 'vibes'] } }));
  assert.deepEqual(p.types.map((t) => t.name), ['security', 'testing', 'code-structure']);
  assert.deepEqual(p.addedRequired, ['security', 'testing']);
  assert.deepEqual(p.unknownTypes, ['vibes']);
});

test('cap drops lowest priority non-required types', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/other', number: 3 } }, config: { limits: { max_specialists_per_run: 3 } } }));
  assert.deepEqual(p.types.map((t) => t.name), ['security', 'testing', 'coding-practices']);
  assert.deepEqual(p.droppedTypes, ['documentation']);
});

test('unknown repo falls back to company defaults and infers languages from files', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/other', number: 3 } }, files: ['a.py', 'b.py', 'c.go'] }));
  assert.deepEqual(p.project, { name: null, source: 'defaults' });
  assert.equal(p.kind, 'service');
  assert.deepEqual(p.languages, ['python', 'go']);
  assert.equal(p.languagesSource, 'files');
  assert.deepEqual(p.types.map((t) => t.name), ['security', 'testing', 'coding-practices', 'documentation']);
  assert.equal(p.roots.project, null);
});

test('no company at all uses framework defaults: all seven types', async () => {
  const p = await resolveRun(input({ companyDir: null, request: { id: 'r', action: 'review', target: { kind: 'local', path: '/x' } }, files: ['m.java'] }));
  assert.equal(p.project.source, 'framework');
  assert.equal(p.types.length, 7);
  assert.deepEqual(p.languages, ['java']);
  assert.equal(p.roots.company, null);
});

test('target manifest adds only; ignored fields listed; target layer set when the dir exists', async () => {
  const p = await resolveRun(input({ targetGuidelinesDir: targetGuidelines }));
  assert.deepEqual(p.languages, ['go', 'ts', 'python']);
  assert.equal(p.kind, 'library');
  assert.equal(p.posting.policy, 'comment-only');
  assert.ok(p.types.find((t) => t.name === 'security')!.required);
  assert.ok(p.types.some((t) => t.name === 'documentation'), 'target may add a type the project did not list');
  assert.deepEqual(p.ignoredTargetFields, ['kind', 'posting', 'prompt', 'types.documentation.prompt', 'types.security']);
  assert.equal(p.types.find((t) => t.name === 'documentation')!.prompt, '${framework}/prompts/specialist.md', 'a repo may not pick a template');
  assert.equal(p.roots.repo, targetGuidelines);
});

test('local target with no matching path prefix falls back to defaults', async () => {
  const p = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'local', path: '/home/you/dev/widgets' } } }));
  assert.equal(p.project.source, 'defaults');
});

test('a manifest-level prompt applies to every type that does not set its own', async () => {
  const p = await resolveRun(input({ companyDir: null, request: { id: 'r', action: 'review', target: { kind: 'local', path: '/x' } }, files: [] }));
  assert.ok(p.types.every((t) => t.prompt === '${framework}/prompts/specialist.md'));
  const q = await resolveRun(input({ request: { id: 'r', action: 'review', target: { kind: 'pr', repo: 'acme/private-tools', number: 2 } } }));
  assert.deepEqual(q.types.map((t) => [t.name, t.prompt]), [['security', '${company}/prompts/strict.md'], ['testing', '${company}/prompts/strict.md']]);
});
