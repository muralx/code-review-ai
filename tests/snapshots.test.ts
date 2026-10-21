import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compose, type ComposeInput } from '../src/lib/compose.ts';
import { REVIEW_TYPES, type TargetKind } from '../src/lib/types.ts';
import type { TaskInput } from '../src/lib/task-block.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIX = join(ROOT, 'tests/fixtures');
const SNAP = join(ROOT, 'tests/snapshots');
const UPDATE = process.env['UPDATE_SNAPSHOTS'] === '1';

function task(targetKind: TargetKind, type: string): TaskInput {
  const base = {
    run_id: 'snapshot-run', target_dir: '/runs/snapshot-run/target', meta_dir: '/runs/snapshot-run/meta',
    files_path: '/runs/snapshot-run/meta/files.json', siblings: ['/clones/acme-widgets-sdk'], prior_review: null,
    output_path: `/runs/snapshot-run/findings/${type}.md`, work_dir: `/runs/snapshot-run/work/${type}`, frontmatter: { run: 'snapshot-run', type },
  };
  if (targetKind === 'pr') return { ...base, target_kind: 'pr', repo: 'acme/widgets', pr: { number: 123, url: 'https://github.com/acme/widgets/pull/123', title: 'Replace token cache', base: 'main', head_sha: 'abc123' }, diff_path: '/runs/snapshot-run/meta/diff.patch' };
  if (targetKind === 'audit') return { ...base, target_kind: 'audit', repo: 'acme/widgets', ref: 'main', paths: ['internal/token'] };
  return { ...base, target_kind: 'local', path: '/home/you/dev/widgets', ref: 'main', diff_path: '/runs/snapshot-run/meta/diff.patch' };
}

const scenarios: Array<{ name: string; make: (type: string) => ComposeInput }> = [
  { name: 'go-service-pr', make: (type) => ({ template: '${framework}/prompts/specialist.md', roots: { framework: ROOT, company: join(FIX, 'company-acme'), project: null, repo: null }, type, kind: 'service', languages: ['go'], targetKind: 'pr', task: task('pr', type) }) },
  { name: 'go-hexagonal-pr', make: (type) => ({ template: '${framework}/prompts/hexagonal-service.md', roots: { framework: ROOT, company: join(FIX, 'company-acme'), project: null, repo: null }, type, kind: 'service', languages: ['go'], targetKind: 'pr', task: task('pr', type) }) },
  { name: 'ts-library-local', make: (type) => ({ template: type === 'security' ? '${company}/prompts/security.md' : '${framework}/prompts/specialist.md', roots: { framework: ROOT, company: join(FIX, 'company-acme'), project: join(FIX, 'company-acme/projects/widgets'), repo: join(FIX, 'target-widgets/.code-review') }, type, kind: 'library', languages: ['ts'], targetKind: 'local', task: task('local', type) }) },
];

for (const s of scenarios) {
  for (const type of REVIEW_TYPES) {
    test(`snapshot ${s.name} ${type}`, async () => {
      const { prompt, resolution } = await compose(s.make(type));
      assert.ok(resolution.files.some((f) => f.used && f.ref === `\${framework}/agents/types/${type}.md`), 'identity present');
      assert.ok(resolution.files.some((f) => f.used && f.ref === `\${framework}/guidelines/types/${type}/general.md`), 'general guideline present');
      assert.doesNotMatch(prompt, /^\$\{/m, 'no unexpanded include lines');
      const file = join(SNAP, `${s.name}-${type}.md`);
      if (UPDATE) { await mkdir(SNAP, { recursive: true }); await writeFile(file, prompt, 'utf8'); return; }
      const expected = await readFile(file, 'utf8').catch(() => null);
      assert.ok(expected !== null, `missing snapshot ${file}; run pnpm snapshots:update`);
      assert.equal(prompt, expected);
    });
  }
}
