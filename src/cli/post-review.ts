#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { checkReview, postReview, PostRefused } from '../lib/post-review.ts';

/** Prints `msg` and the usage line to stderr and exits 2. */
function usage(msg: string): never {
  process.stderr.write(`post-review: ${msg}\nusage: post-review --run DIR [--dry-run | --check]\n`);
  process.exit(2);
}

/**
 * Posts a run's review, or with `--check` only validates review.md (exit 4 on a
 * problem). Prints the result as JSON.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { run: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, check: { type: 'boolean', default: false } }, strict: true });
  if (!values.run) usage('--run is required');
  if (values.check) {
    // Validates review.md only: no posting policy, no gh call, nothing written. Exit 4 on problems.
    const problems = await checkReview(resolve(values.run));
    if (problems.length) {
      for (const p of problems) process.stderr.write(`post-review: check: ${p}\n`);
      process.exit(4);
    }
    process.stdout.write('review.md ok\n');
    return;
  }
  const r = await postReview({ runDir: resolve(values.run), dryRun: values['dry-run'] });
  process.stdout.write(JSON.stringify(r) + '\n');
}

main().catch((err: unknown) => {
  if (err instanceof PostRefused) {
    process.stderr.write(`post-review: refused: ${err.message}\n`);
    process.exit(err.code);
  }
  process.stderr.write(`post-review: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
