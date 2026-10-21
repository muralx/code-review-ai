import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadManifest, findProject, mergeTarget, FRAMEWORK_DEFAULTS } from './manifest.ts';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';

test('loadManifest validates and reports unknown types', async () => {
  const d = await makeTree({ 'm.yaml': 'repo: acme/w\nkind: library\nlanguages: [go]\nposting: never\ntypes:\n  security: { required: true }\n  vibes: {}\n' });
  const r = await loadManifest(join(d, 'm.yaml'));
  assert.deepEqual(r?.manifest, { repo: 'acme/w', kind: 'library', languages: ['go'], posting: 'never', types: { security: { required: true } } });
  assert.deepEqual(r?.unknownTypes, ['vibes']);
  assert.equal(await loadManifest(join(d, 'none.yaml')), null);
  await removeTree(d);
});

test('loadManifest rejects bad vocab and bad prompt references', async () => {
  const d = await makeTree({ 'm.yaml': 'kind: spaceship\n', 'p.yaml': 'prompt: prompts/x.md\n', 'q.yaml': 'types:\n  security: { prompt: "${repo}/x.md" }\n', 'ok.yaml': 'prompt: "${company}/prompts/x.md"\ntypes:\n  security: { prompt: "${project}/p.md" }\n' });
  await assert.rejects(loadManifest(join(d, 'm.yaml')), /kind must be one of/);
  await assert.rejects(loadManifest(join(d, 'p.yaml')), /prompt must be \$\{framework\|company\|project\}\/path\.md/);
  await assert.rejects(loadManifest(join(d, 'q.yaml')), /types\.security\.prompt must be/);
  const ok = await loadManifest(join(d, 'ok.yaml'));
  assert.deepEqual(ok?.manifest, { prompt: '${company}/prompts/x.md', types: { security: { prompt: '${project}/p.md' } } });
  await removeTree(d);
});

test('findProject matches by repo and by longest local path prefix', async () => {
  const co = await makeTree({
    'projects/widgets/manifest.yaml': 'repo: acme/widgets\n',
    'projects/dev/manifest.yaml': 'repo: /home/you/dev\n',
    'projects/dev-widgets/manifest.yaml': 'repo: /home/you/dev/widgets\n',
  });
  const byRepo = await findProject(co, { kind: 'pr', repo: 'acme/widgets' });
  assert.equal(byRepo?.name, 'widgets');
  const local = await findProject(co, { kind: 'local', path: '/home/you/dev/widgets/sub' });
  assert.equal(local?.name, 'dev-widgets');
  const other = await findProject(co, { kind: 'local', path: '/home/you/dev/widgetsX' });
  assert.equal(other?.name, 'dev');
  assert.equal(await findProject(co, { kind: 'pr', repo: 'acme/none' }), null);
  await removeTree(co);
});

test('mergeTarget only adds types and languages', () => {
  const { merged, ignored } = mergeTarget(
    { kind: 'service', languages: ['go'], posting: 'auto', types: { security: { required: true } } },
    { kind: 'tool', languages: ['ts'], posting: 'never', siblings: ['x'], prompt: '${company}/p.md', types: { security: { required: false }, testing: { model: 'm', prompt: '${company}/t.md' } } },
  );
  assert.deepEqual(merged, { kind: 'service', languages: ['go', 'ts'], posting: 'auto', types: { security: { required: true }, testing: { model: 'm' } } });
  assert.deepEqual(ignored, ['kind', 'posting', 'siblings', 'prompt', 'types.security', 'types.testing.prompt']);
});

test('framework defaults list every type', () => {
  assert.equal(Object.keys(FRAMEWORK_DEFAULTS.types ?? {}).length, 7);
  assert.equal(FRAMEWORK_DEFAULTS.kind, 'service');
  assert.equal(FRAMEWORK_DEFAULTS.posting, 'auto');
});
