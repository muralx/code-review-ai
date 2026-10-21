import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TargetKind } from './types.ts';

/** Lifecycle state of a run; `done` and `failed` are terminal. */
export type RunStatus = 'queued' | 'preparing' | 'reviewing' | 'merging' | 'delivering' | 'done' | 'failed' | 'blocked';
/**
 * Statuses that count as an active run, so discovery does not start another for
 * the same PR; includes `blocked`.
 */
export const IN_FLIGHT: readonly RunStatus[] = ['queued', 'preparing', 'reviewing', 'merging', 'delivering', 'blocked'];

/**
 * What a run reviews, refined by prep-target (head sha, base, audited sha) once
 * the target is checked out.
 */
export type RunTarget =
  | { kind: 'pr'; repo: string; number: number; head_sha?: string; url?: string; base?: string }
  | { kind: 'audit'; repo: string; ref: string; sha?: string; paths?: string[] }
  | { kind: 'local'; path: string; ref: string; head_sha?: string; paths?: string[] };

/** run.json: the state of one review run, updated through its lifecycle. */
export interface RunRecord {
  /** Run id, also the name of the run's directory. */
  id: string;
  /**
   * Whether this is a first review or a rereview of a target reviewed before.
   */
  action: 'review' | 'rereview';
  /** Current lifecycle state. */
  status: RunStatus;
  /** What is reviewed. */
  target: RunTarget;
  /**
   * Content identity of the reviewed snapshot from prep-target (head sha for a
   * PR); set once prepared.
   */
  identity?: string;
  /** 1 for a first try, 2 for the automatic retry of a failed run. */
  attempts: number;
  /** The failed run this one retries. */
  retry_of?: string;
  /** the run whose review.md is the prior review for a rereview */
  prior_run?: string;
  /** set by discover when the PR was merged or closed; such runs are never re-checked */
  retired?: { at: string; state: string };
  /**
   * How the request arrived, and for agent-link the conversation and peer to
   * answer.
   */
  source: { intake: 'agent-link' | 'poll'; conversation_id?: string; from?: string };
  /** ISO timestamp of creation; orders runs of the same PR. */
  created_at: string;
  /** ISO timestamp of the last change to the record. */
  updated_at: string;
  /** Review types that ran, set when the run is prepared. */
  types?: string[];
  /**
   * What was posted: the commit, the verdict and when, plus any disagreement
   * with the merged verdict.
   */
  delivery?: { posted_sha?: string; verdict?: 'approve' | 'request-changes' | 'comment'; posted_at?: string; verdict_disagreement?: string; posted_as?: 'comment'; posted_as_reason?: string };
  /** Why the run failed. */
  failure?: string;
}

/** Map key for a pull request, `owner/repo#number`. */
export function prKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/**
 * Reads run.json from a run directory; throws if it is missing or not valid
 * JSON.
 */
export async function readRun(runDir: string): Promise<RunRecord> {
  return JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8')) as RunRecord;
}

/** Writes run.json under `runsDir/<id>`, creating the directory. */
export async function writeRun(runsDir: string, run: RunRecord): Promise<void> {
  const dir = join(runsDir, run.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
}

/**
 * Every run under runsDir; an empty list when runsDir does not exist, and
 * directories without run.json are skipped.
 */
export async function listRuns(runsDir: string): Promise<RunRecord[]> {
  let entries;
  try {
    entries = await readdir(runsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: RunRecord[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      out.push(await readRun(join(runsDir, e.name)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  return out;
}

/** Latest run per pull request, keyed `owner/repo#number`, newest by created_at. */
export async function latestRunsByPr(runsDir: string): Promise<Map<string, RunRecord>> {
  const latest = new Map<string, RunRecord>();
  for (const r of await listRuns(runsDir)) {
    if (r.target.kind !== 'pr') continue;
    const key = prKey(r.target.repo, r.target.number);
    const cur = latest.get(key);
    if (!cur || r.created_at > cur.created_at) latest.set(key, r);
  }
  return latest;
}

/**
 * Appends a timestamped event line to `runsDir/index.jsonl`, the append-only
 * log of run events.
 */
export async function appendIndex(runsDir: string, entry: Record<string, unknown>): Promise<void> {
  await mkdir(runsDir, { recursive: true });
  await appendFile(join(runsDir, 'index.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

/** Target kind of a run. */
export function targetKindOf(run: RunRecord): TargetKind {
  return run.target.kind;
}
