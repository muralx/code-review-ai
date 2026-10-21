import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Captured output of a successful `gh` call. */
export interface GhResult { stdout: string; stderr: string }

/** A `gh` call that failed to start or exited non-zero. */
export class GhError extends Error {
  /** Arguments the call was made with. */
  readonly args: string[];
  /**
   * Exit status, or an errno name such as ENOENT when `gh` could not be run;
   * null when unknown.
   */
  readonly code: number | string | null;
  /** Standard error of the call, or the error message when there was none. */
  readonly stderr: string;
  /**
   * Build the error with a message naming the command, the code and the trimmed
   * stderr.
   */
  constructor(args: string[], code: number | string | null, stderr: string) {
    super(`gh ${args.join(' ')} failed (${String(code)}): ${stderr.trim()}`);
    this.args = args;
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Run the GitHub CLI with the process environment and return its output; throws
 * GhError on failure.
 */
export async function gh(args: string[]): Promise<GhResult> {
  try {
    const r = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, env: process.env });
    return { stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number | string; stderr?: string };
    throw new GhError(args, e.code ?? null, e.stderr ?? e.message);
  }
}

/** Run `gh` and parse its stdout as JSON; the type is asserted, not checked. */
export async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await gh(args);
  return JSON.parse(stdout) as T;
}
