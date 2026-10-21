import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { placeholders, render } from './render.ts';
import { parseMarkdown } from './frontmatter.ts';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

const VARS = {
  WORKSPACE: 'acme-dev', AGENT_NAME: 'code-reviewer', NOTIFY_PEER: 'human', DEPLOYMENT_DIR: '/srv/reviews/acme',
  FRAMEWORK_DIR: '/opt/code-review-ai', POLL_MINUTES: 10, MAX_CONCURRENT: 2, COMPANY_NAME: 'acme',
};

test('render replaces every placeholder and rejects missing ones', () => {
  assert.equal(render('hi {{A}} and {{B}}, {{A}} again', { A: 'x', B: 2 }), 'hi x and 2, x again');
  assert.deepEqual(placeholders('{{A}} {{B}} {{A}}'), ['A', 'B']);
  assert.throws(() => render('{{A}} {{C}}', { A: 1 }), /missing values for: C/);
});

test('coordinator template and commands render with the deployment variables and keep valid frontmatter', async () => {
  const coordinator = await readFile(join(ROOT, 'agents/coordinator.md'), 'utf8');
  const out = render(coordinator, VARS);
  assert.doesNotMatch(out, /\{\{/);
  assert.match(out, /code-reviewer/);
  assert.match(out, /acme-dev/);
  for (const f of await readdir(join(ROOT, 'agents/commands'))) {
    const text = render(await readFile(join(ROOT, 'agents/commands', f), 'utf8'), VARS);
    assert.doesNotMatch(text, /\{\{/, f);
    const { frontmatter } = parseMarkdown(text, f);
    assert.ok(frontmatter !== undefined);
    assert.match(text, /^---\ndescription: /m, `${f} has a description`);
  }
});
