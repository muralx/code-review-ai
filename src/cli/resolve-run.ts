#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { resolveRun } from '../lib/resolve.ts';
import { isTargetKind, type Config, type Request } from '../lib/types.ts';

/** Prints `msg` and the usage line to stderr and exits 2. */
function usage(msg: string): never {
  process.stderr.write(`resolve-run: ${msg}\n` +
    'usage: resolve-run --request request.json --config config.yaml --framework DIR [--company DIR] [--target-guidelines DIR] [--files files.json] --out plan.json\n');
  process.exit(2);
}

/**
 * Checks the shape of request.json (id, action, target kind, types, post),
 * exiting with usage on a bad field.
 */
function validateRequest(raw: unknown): Request {
  if (typeof raw !== 'object' || raw === null) usage('request.json must be an object');
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string') usage('request.json: id must be a string');
  if (r['action'] !== 'review' && r['action'] !== 'rereview') usage('request.json: action must be review or rereview');
  const t = r['target'];
  if (typeof t !== 'object' || t === null) usage('request.json: target must be an object');
  const kind = (t as Record<string, unknown>)['kind'];
  if (typeof kind !== 'string' || !isTargetKind(kind)) usage('request.json: target.kind must be pr | audit | local');
  if (r['types'] !== undefined && (!Array.isArray(r['types']) || !r['types'].every((x) => typeof x === 'string'))) usage('request.json: types must be a list of strings');
  if (r['post'] !== undefined && typeof r['post'] !== 'boolean') usage('request.json: post must be a boolean');
  return raw as Request;
}

/**
 * Resolves a request against config and the framework, company and
 * target-guidelines layers, and writes the plan to `--out`.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      request: { type: 'string' }, config: { type: 'string' }, framework: { type: 'string' },
      company: { type: 'string' }, 'target-guidelines': { type: 'string' }, files: { type: 'string' }, out: { type: 'string' },
    },
    strict: true,
  });
  for (const k of ['request', 'config', 'framework', 'out'] as const) if (!values[k]) usage(`--${k} is required`);

  const request = validateRequest(JSON.parse(await readFile(values.request!, 'utf8')));
  const config = (parse(await readFile(values.config!, 'utf8')) ?? {}) as Config;
  const files = values.files ? (JSON.parse(await readFile(values.files, 'utf8')) as unknown) : [];
  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) usage('files.json must be a JSON array of paths');

  const plan = await resolveRun({
    request, config,
    frameworkDir: resolve(values.framework!),
    companyDir: values.company ? resolve(values.company) : null,
    targetGuidelinesDir: values['target-guidelines'] ? resolve(values['target-guidelines']) : null,
    files: files as string[],
  });
  const out = resolve(values.out!);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

main().catch((err: unknown) => {
  process.stderr.write(`resolve-run: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
