import { lstat, mkdir, readdir, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';
import { appendIndex, listRuns, readRun, type RunRecord, type RunStatus, type RunTarget } from './runs.ts';
import type { Request } from './types.ts';
import type { Candidate } from './discover.ts';

const exec = promisify(execFile);

/**
 * How a request reached the service: discovered by polling or sent over
 * agent-link.
 */
export type Intake = 'poll' | 'agent-link';
/**
 * Where a run's request came from, recorded on the run so the answer can go
 * back.
 */
export interface Source { intake: Intake; conversation_id?: string; from?: string }

/** UTC timestamp for run ids: ISO without milliseconds and with `-` for `:`. */
function stamp(d = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/**
 * Lowercase a string and collapse anything outside `[A-Za-z0-9._-]` into single
 * dashes, trimmed.
 */
function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

/** Run ids: <timestamp>-<repo slug>-<number> | <timestamp>-audit-<repo slug> | <timestamp>-local-<basename>. */
export function runIdFor(request: Request, now = new Date()): string {
  const t = request.target;
  const ts = stamp(now);
  switch (t.kind) {
    case 'pr': return `${ts}-${slug(t.repo ?? 'repo')}-${t.number ?? 0}`;
    case 'audit': return `${ts}-audit-${slug(t.repo ?? 'repo')}`;
    case 'local': return `${ts}-local-${slug(basename(t.path ?? 'tree'))}`;
  }
}

/**
 * The run target for a request's target, with defaults for missing fields (ref
 * main for audits).
 */
export function targetFromRequest(request: Request): RunTarget {
  const t = request.target;
  switch (t.kind) {
    case 'pr': return { kind: 'pr', repo: t.repo ?? '', number: t.number ?? 0 };
    case 'audit': return { kind: 'audit', repo: t.repo ?? '', ref: t.ref ?? 'main', ...(t.paths?.length ? { paths: t.paths } : {}) };
    case 'local': return { kind: 'local', path: t.path ?? '', ref: t.ref ?? '', ...(t.paths?.length ? { paths: t.paths } : {}) };
  }
}

/** Turn a discover candidate into a poll-intake request. */
export function requestFromCandidate(c: Candidate, now = new Date()): { request: Request; extra: Pick<RunRecord, 'attempts' | 'retry_of' | 'prior_run'> & { head_sha: string } } {
  const request: Request = { id: '', action: c.action, target: { kind: 'pr', repo: c.repo, number: c.number }, context: `Discovered by polling: ${c.reason}.` };
  request.id = runIdFor(request, now);
  return {
    request,
    extra: { attempts: c.attempts, head_sha: c.head_sha, ...(c.retry_of ? { retry_of: c.retry_of } : {}), ...(c.prior_run ? { prior_run: c.prior_run } : {}) },
  };
}

/** Inputs to newRun. */
export interface NewRunOptions {
  /** Directory holding all runs and the index. */
  runsDir: string;
  /** The request to run; an empty id is replaced by one from runIdFor. */
  request: Request;
  /** Where the request came from. */
  source: Source;
  /** Attempt number of this run, 1 when unset. */
  attempts?: number;
  /** Id of the failed run this one retries. */
  retry_of?: string;
  /** Id of the run whose review a re-review builds on. */
  prior_run?: string;
  /** PR head commit at discovery, recorded on PR targets only. */
  head_sha?: string;
  /**
   * Creation time, for the run id and timestamps; the current time when unset.
   */
  now?: Date;
}

/** Create runs/<id>/ with request.json and run.json in status queued, and an index line. */
export async function newRun(o: NewRunOptions): Promise<RunRecord> {
  const now = o.now ?? new Date();
  const id = o.request.id || runIdFor(o.request, now);
  const request: Request = { ...o.request, id };
  const target = targetFromRequest(request);
  if (target.kind === 'pr' && o.head_sha) target.head_sha = o.head_sha;
  const run: RunRecord = {
    id, action: request.action, status: 'queued', target,
    attempts: o.attempts ?? 1,
    ...(o.retry_of ? { retry_of: o.retry_of } : {}),
    ...(o.prior_run ? { prior_run: o.prior_run } : {}),
    source: o.source, created_at: now.toISOString(), updated_at: now.toISOString(),
  };
  const dir = join(o.runsDir, id);
  await mkdir(join(dir, 'meta'), { recursive: true });
  await writeFile(join(dir, 'request.json'), JSON.stringify(request, null, 2) + '\n', 'utf8');
  await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
  await appendIndex(o.runsDir, { run: id, status: 'queued', action: run.action, target: run.target });
  return run;
}

/**
 * Read run.json, apply `patch`, bump updated_at and write it back. Adds no
 * index line.
 */
export async function updateRun(runDir: string, patch: (run: RunRecord) => void): Promise<RunRecord> {
  const run = await readRun(runDir);
  patch(run);
  run.updated_at = new Date().toISOString();
  await writeFile(join(runDir, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
  return run;
}

/**
 * Set a run's status (and failure, if given) and append the change, with any
 * note, to the index.
 */
export async function setStatus(runsDir: string, id: string, status: RunStatus, extra: { failure?: string; note?: string } = {}): Promise<RunRecord> {
  const run = await updateRun(join(runsDir, id), (r) => {
    r.status = status;
    if (extra.failure) r.failure = extra.failure;
  });
  await appendIndex(runsDir, { run: id, status, ...(extra.failure ? { failure: extra.failure } : {}), ...(extra.note ? { note: extra.note } : {}) });
  return run;
}

/** Remove runs/<id>/target: a git worktree is detached from its clone first, a plain snapshot is deleted. */
export async function removeTarget(runDir: string): Promise<boolean> {
  const target = join(runDir, 'target');
  let exists = true;
  try { await readFile(join(target, '.git'), 'utf8').catch(async () => { await (await import('node:fs/promises')).access(target); }); } catch { exists = false; }
  if (!exists) return false;
  try {
    const gitFile = await readFile(join(target, '.git'), 'utf8');
    const m = /^gitdir: (.+)$/m.exec(gitFile);
    if (m) {
      const clone = m[1]!.trim().replace(/\/\.git\/worktrees\/[^/]+$/, '');
      await exec('git', ['-C', clone, 'worktree', 'remove', '--force', target]).catch(() => undefined);
      await exec('git', ['-C', clone, 'worktree', 'prune']).catch(() => undefined);
    }
  } catch { /* a snapshot has a .git directory, not a file */ }
  await rm(target, { recursive: true, force: true });
  return true;
}

/**
 * Remove runs/<id>/work, the specialists' scratch directories, and return what was removed
 * (work/<name> per entry). Nothing outside work/ is touched: review.md, findings/, posted.md,
 * prompts/ and the run metadata stay. A symlinked work/ is unlinked, never followed. A Go module
 * cache a specialist put there is read-only, so the tree is made writable before it is removed.
 */
export async function removeWork(runDir: string): Promise<string[]> {
  const work = join(runDir, 'work');
  let st;
  try { st = await lstat(work); } catch { return []; }
  if (!st.isDirectory()) { await rm(work, { force: true }); return ['work']; }
  const entries = (await readdir(work)).sort().map((e) => `work/${e}`);
  await exec('chmod', ['-R', 'u+w', work]).catch(() => undefined);
  await rm(work, { recursive: true, force: true });
  return entries;
}

/** A process stopped by stopRunProcesses: its pid and command line. */
export interface StoppedProcess { pid: number; cmd: string }

/** This process and its ancestors, which a run's cleanup must never signal. */
async function selfAndAncestors(): Promise<Set<number>> {
  const pids = new Set<number>();
  let pid = process.pid;
  while (pid > 1 && !pids.has(pid)) {
    pids.add(pid);
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
    pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  }
  return pids;
}

/**
 * Stop every process still running from a run directory: its working directory, its executable or
 * an argument lies under runDir. These are background processes a specialist started (a server, a
 * collector) and left behind; once the specialist has returned nothing else stops them. Sends
 * SIGTERM, then SIGKILL to whatever is left after graceMs. Reads /proc, so elsewhere it is a no-op.
 */
export async function stopRunProcesses(runDir: string, graceMs = 3000): Promise<StoppedProcess[]> {
  let root: string;
  try { root = `${await realpath(runDir)}/`; } catch { return []; }
  let entries: string[];
  try { entries = await readdir('/proc'); } catch { return []; }
  const skip = await selfAndAncestors();
  const under = (p: string) => p === root.slice(0, -1) || p.startsWith(root);
  const found: StoppedProcess[] = [];
  for (const e of entries) {
    if (!/^\d+$/.test(e) || skip.has(Number(e))) continue;
    const args = (await readFile(`/proc/${e}/cmdline`, 'utf8').catch(() => '')).split('\0').filter(Boolean);
    if (!args.length) continue; // kernel thread, zombie or gone
    const cwd = await readlink(`/proc/${e}/cwd`).catch(() => '');
    const exe = await readlink(`/proc/${e}/exe`).catch(() => '');
    if (under(cwd) || under(exe) || args.some((a) => a.includes(root))) found.push({ pid: Number(e), cmd: args.join(' ') });
  }
  const signal = (pid: number, sig: NodeJS.Signals | 0) => { try { process.kill(pid, sig); return true; } catch { return false; } };
  const alive = found.filter((p) => signal(p.pid, 'SIGTERM'));
  const deadline = Date.now() + graceMs;
  while (alive.some((p) => signal(p.pid, 0)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  for (const p of alive) signal(p.pid, 'SIGKILL');
  return found;
}

/**
 * Mark a run done or failed. Either way, first stops any process still running from the run
 * directory and records it as a "stopped" index event. On done, then removes the specialists'
 * work/ directories and the target tree, and records what was removed as a "cleaned" index event;
 * on failed, the files are kept for inspection.
 */
export async function finishRun(runsDir: string, id: string, outcome: 'done' | 'failed', failure?: string): Promise<RunRecord> {
  const run = await setStatus(runsDir, id, outcome, failure ? { failure } : {});
  const stopped = await stopRunProcesses(join(runsDir, id));
  if (stopped.length) await appendIndex(runsDir, { run: id, event: 'stopped', processes: stopped });
  if (outcome === 'done') {
    // The specialists' own directories go first: they may hold worktrees of the same clone, which the prune in removeTarget then forgets.
    const removed = await removeWork(join(runsDir, id));
    if (await removeTarget(join(runsDir, id))) removed.push('target');
    if (removed.length) await appendIndex(runsDir, { run: id, event: 'cleaned', removed });
  }
  return run;
}

/** Drop target trees of runs that discover marked retired. Returns the ids cleaned. */
export async function cleanRetired(runsDir: string): Promise<string[]> {
  const cleaned: string[] = [];
  for (const run of await listRuns(runsDir)) {
    if (!run.retired) continue;
    if (await removeTarget(join(runsDir, run.id))) cleaned.push(run.id);
  }
  return cleaned;
}

/** Overview of all runs for the status command. */
export interface StatusSummary {
  /** Number of runs in each status. */
  counts: Record<RunStatus, number>;
  /** Runs neither done nor failed, with the time of their last update. */
  inFlight: Array<{ id: string; status: RunStatus; target: string; since: string }>;
  /**
   * Most recently updated runs, newest first, with the posted verdict when
   * there is one.
   */
  recent: Array<{ id: string; status: RunStatus; target: string; verdict?: string; updated_at: string }>;
}

/**
 * Short human label for a run target, such as `owner/repo#7` or `audit
 * owner/repo@main`.
 */
export function describeTarget(t: RunTarget): string {
  switch (t.kind) {
    case 'pr': return `${t.repo}#${t.number}`;
    case 'audit': return `audit ${t.repo}@${t.ref}${t.paths?.length ? ` [${t.paths.join(', ')}]` : ''}`;
    case 'local': return `local ${t.path}`;
  }
}

/**
 * Count runs by status and list those in flight and the `recentLimit` most
 * recently updated.
 */
export async function statusSummary(runsDir: string, recentLimit = 10): Promise<StatusSummary> {
  const runs = await listRuns(runsDir);
  const counts: Record<RunStatus, number> = { queued: 0, preparing: 0, reviewing: 0, merging: 0, delivering: 0, done: 0, failed: 0, blocked: 0 };
  for (const r of runs) counts[r.status]++;
  const inFlight = runs.filter((r) => !['done', 'failed'].includes(r.status)).map((r) => ({ id: r.id, status: r.status, target: describeTarget(r.target), since: r.updated_at }));
  const recent = [...runs].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, recentLimit)
    .map((r) => ({ id: r.id, status: r.status, target: describeTarget(r.target), ...(r.delivery?.verdict ? { verdict: r.delivery.verdict } : {}), updated_at: r.updated_at }));
  return { counts, inFlight, recent };
}
