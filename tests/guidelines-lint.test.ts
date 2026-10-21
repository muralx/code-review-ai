import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { KINDS, LANGUAGES, REVIEW_TYPES } from '../src/lib/types.ts';
import { parseMarkdown } from '../src/lib/frontmatter.ts';

/**
 * Structural and neutrality rules for framework content. The composer accepts any markdown;
 * these tests keep the library coherent: every type has an identity and a general checklist,
 * amendments are named after known kinds, languages and types, guideline files leave `#` and
 * `##` to the template, and nothing company-specific slips into the framework.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

const exists = (p: string) => stat(p).then(() => true, () => false);

/**
 * Names that belong to one company, product, person or tracker; never to the framework. The
 * built-in entries are placeholders that keep the check exercised; the real names of whoever
 * maintains a checkout go in `tests/forbidden-names.local` (gitignored), one case-insensitive
 * regular expression per line, `#` starting a comment.
 */
const FORBIDDEN: RegExp[] = [/\bzentrovia\b/i, /\bkorvald\b/i, /\bQX-\d+\b/, ...(await localForbidden())];

async function localForbidden(): Promise<RegExp[]> {
  let text: string;
  try { text = await readFile(join(ROOT, 'tests', 'forbidden-names.local'), 'utf8'); } catch { return []; }
  return text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((l) => new RegExp(l, 'i'));
}

test('every review type has an identity and a general checklist', async () => {
  for (const t of REVIEW_TYPES) {
    assert.ok(await exists(join(ROOT, 'agents/types', `${t}.md`)), `agents/types/${t}.md missing`);
    assert.ok(await exists(join(ROOT, 'guidelines/types', t, 'general.md')), `guidelines/types/${t}/general.md missing`);
  }
});

test('amendment and pack files are named after known types, kinds and languages', async () => {
  const types = new Set<string>(REVIEW_TYPES);
  for (const t of await readdir(join(ROOT, 'guidelines/types'))) {
    assert.ok(types.has(t), `guidelines/types/${t} is not a review type`);
    for (const f of await walk(join(ROOT, 'guidelines/types', t))) {
      const rel = relative(join(ROOT, 'guidelines/types', t), f);
      const [dir, name] = rel.split('/');
      if (name === undefined) { assert.equal(dir, 'general.md', `${rel}: only general.md may sit at the type root`); continue; }
      const base = name.replace(/\.md$/, '');
      if (dir === 'kind') assert.ok((KINDS as readonly string[]).includes(base), `${t}/${rel}: unknown kind`);
      else if (dir === 'lang') assert.ok((LANGUAGES as readonly string[]).includes(base), `${t}/${rel}: unknown language`);
      else assert.fail(`${t}/${rel}: only kind/ and lang/ are allowed`);
    }
  }
  const packs = join(ROOT, 'guidelines/packs');
  if (await exists(packs)) {
    for (const pack of await readdir(packs)) {
      for (const f of await readdir(join(packs, pack))) {
        assert.ok(types.has(f.replace(/\.md$/, '')), `packs/${pack}/${f}: not named after a review type`);
      }
    }
  }
});

test('guideline files use ### and lower, carry only applies_to frontmatter, and have the exemplar sections', async () => {
  const files = [...(await walk(join(ROOT, 'guidelines')))];
  for (const f of files) {
    const rel = relative(ROOT, f);
    const raw = await readFile(f, 'utf8');
    const { body, frontmatter } = parseMarkdown(raw, f);
    assert.doesNotMatch(body, /^#{1,2}\s/m, `${rel}: a guideline file may not use # or ## headings`);
    const fmKeys = raw.startsWith('---') ? raw.split('---')[1]!.split('\n').map((l) => l.split(':')[0]!.trim()).filter(Boolean) : [];
    for (const k of fmKeys) assert.equal(k, 'applies_to', `${rel}: unexpected frontmatter key ${k}`);
    if (frontmatter.applies_to) assert.ok(frontmatter.applies_to.length > 0, `${rel}: empty applies_to`);
    if (rel.startsWith('guidelines/types/') || rel.startsWith('guidelines/packs/')) {
      assert.match(body, /^### Always check/m, `${rel}: missing "### Always check" section`);
      assert.match(body, /\*\*(Critical|Major|Minor|Nit)\*\*/, `${rel}: no severity named`);
      assert.match(body, /^### (Common false positives|False positives)/m, `${rel}: missing false-positives section`);
    }
    assert.doesNotMatch(body, /^\$\{(framework|company|project|repo)\}\//m, `${rel}: framework guideline files do not include other files`);
  }
});

test('framework content names no company, product, person or tracker', async () => {
  const dirs = ['agents', 'guidelines', 'prompts', 'templates'];
  for (const d of dirs) {
    for (const f of await walk(join(ROOT, d))) {
      const rel = relative(ROOT, f);
      const text = await readFile(f, 'utf8');
      for (const re of FORBIDDEN) {
        const m = re.exec(text);
        assert.equal(m, null, `${rel}: forbidden term ${JSON.stringify(m?.[0])} (${re})`);
      }
    }
  }
});

test('every template includes the identity, the general checklist and the task block', async () => {
  for (const f of await walk(join(ROOT, 'prompts'))) {
    const text = await readFile(f, 'utf8');
    const rel = relative(ROOT, f);
    assert.match(text, /^\$\{framework\}\/agents\/types\/\$\{type\}\.md$/m, `${rel}: identity line missing`);
    assert.match(text, /^\$\{framework\}\/guidelines\/common\/\*\.md$/m, `${rel}: common policy missing`);
    assert.match(text, /^\$\{framework\}\/guidelines\/types\/\$\{type\}\/general\.md$/m, `${rel}: general checklist missing`);
    assert.match(text, /^\$\{task\}$/m, `${rel}: task block missing`);
  }
});
