#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { discover } from '../lib/discover.ts';

/** Prints `msg` and the usage line to stderr and exits 2. */
function usage(msg: string): never {
  process.stderr.write(`discover: ${msg}\nusage: discover --config config.yaml --runs DIR [--out result.json]\n`);
  process.exit(2);
}

/**
 * Runs discovery for the `github.repos` of a config.yaml and prints the result
 * as JSON, or writes it to `--out`.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { config: { type: 'string' }, runs: { type: 'string' }, out: { type: 'string' } }, strict: true });
  if (!values.config) usage('--config is required');
  if (!values.runs) usage('--runs is required');
  const cfg = (parse(await readFile(values.config, 'utf8')) ?? {}) as { github?: { repos?: unknown } };
  const repos = cfg.github?.repos;
  if (!Array.isArray(repos) || !repos.every((r) => typeof r === 'string' && r.includes('/'))) usage('config.yaml: github.repos must be a list of owner/name');
  const result = await discover({ repos: repos as string[], runsDir: resolve(values.runs) });
  const text = JSON.stringify(result, null, 2) + '\n';
  if (values.out) await writeFile(resolve(values.out), text, 'utf8'); else process.stdout.write(text);
}

main().catch((err: unknown) => {
  process.stderr.write(`discover: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
