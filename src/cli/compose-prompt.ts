#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compose, DEFAULT_TEMPLATE, parseRef } from '../lib/compose.ts';
import { isKind, isLanguage, isReviewType, isTargetKind } from '../lib/types.ts';
import type { TaskInput } from '../lib/task-block.ts';

/** Prints `msg` and the usage line to stderr and exits 2. */
function usage(msg: string): never {
  process.stderr.write(`compose-prompt: ${msg}\n` +
    'usage: compose-prompt --type T --kind K [--lang L]... [--template ${root}/path.md] --framework DIR [--company DIR] [--project DIR] [--repo DIR] --task task.json --out prompt.md [--resolution resolution.json]\n');
  process.exit(2);
}

/**
 * Composes one specialist prompt from a task.json and writes it to `--out`,
 * with its resolution record beside it (`<out>.resolution.json` unless
 * `--resolution` names another path).
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      type: { type: 'string' }, kind: { type: 'string' }, lang: { type: 'string', multiple: true }, template: { type: 'string' },
      framework: { type: 'string' }, company: { type: 'string' }, project: { type: 'string' }, repo: { type: 'string' },
      task: { type: 'string' }, out: { type: 'string' }, resolution: { type: 'string' },
    },
    strict: true,
  });
  if (!values.type) usage('--type is required');
  if (!isReviewType(values.type)) usage(`unknown review type ${values.type}`);
  if (!values.kind) usage('--kind is required');
  if (!isKind(values.kind)) usage(`unknown kind ${values.kind}`);
  const languages = values.lang ?? [];
  for (const l of languages) if (!isLanguage(l)) usage(`unknown language ${l}`);
  if (!values.framework) usage('--framework is required');
  const template = values.template ?? DEFAULT_TEMPLATE;
  const tpl = parseRef(template);
  if (!tpl || tpl.root === 'repo' || tpl.optional) usage(`--template must be \${framework|company|project}/path.md, got ${template}`);
  if (!values.task) usage('--task is required');
  if (!values.out) usage('--out is required');

  const task = JSON.parse(await readFile(values.task, 'utf8')) as TaskInput;
  if (!isTargetKind(task.target_kind)) usage(`task.json: unknown target_kind ${String(task.target_kind)}`);

  const result = await compose({
    template,
    roots: {
      framework: resolve(values.framework),
      company: values.company ? resolve(values.company) : null,
      project: values.project ? resolve(values.project) : null,
      repo: values.repo ? resolve(values.repo) : null,
    },
    type: values.type, kind: values.kind, languages, targetKind: task.target_kind, task,
  });

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, result.prompt, 'utf8');
  const resPath = values.resolution ? resolve(values.resolution) : `${out}.resolution.json`;
  await mkdir(dirname(resPath), { recursive: true });
  await writeFile(resPath, JSON.stringify(result.resolution, null, 2) + '\n', 'utf8');
}

main().catch((err: unknown) => {
  process.stderr.write(`compose-prompt: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
