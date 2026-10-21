import { gh, ghJson } from './gh.ts';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { appendIndex, IN_FLIGHT, latestRunsByPr, prKey, type RunRecord } from './runs.ts';

/**
 * What a discovery pass reads: the repositories to poll and the runs directory
 * to compare against.
 */
export interface DiscoverInput {
  repos: string[];
  runsDir: string;
  /** How long a pull request's head must stay unchanged before it is reviewed; default SETTLE_MS. */
  settleMs?: number;
  /** The current time, for tests. */
  now?: Date;
}

/** A head younger than this is still being pushed to: wait for the next poll. */
export const SETTLE_MS = 5 * 60_000;

/**
 * A pull request that discovery found worth a run; `cra run from-candidate`
 * turns it into one.
 */
export interface Candidate {
  /**
   * `rereview` when an earlier run's review exists to compare against, else
   * `review`.
   */
  action: 'review' | 'rereview';
  /** Repository as owner/name. */
  repo: string;
  /** Pull request number. */
  number: number;
  /** Head commit GitHub reported at discovery time. */
  head_sha: string;
  /** Pull request title. */
  title: string;
  /** Pull request web URL. */
  url: string;
  /** Base branch name. */
  base: string;
  /**
   * Why it was picked: a first request, a request after the bot posted, commits
   * since the last run, or a retry of a failed run.
   */
  reason: 'requested' | 're-requested' | 'new-commits' | 'retry';
  /** Id of the run whose review.md the rereview compares against. */
  prior_run?: string;
  /** Id of the failed run this one retries. */
  retry_of?: string;
  /**
   * Attempt number for the head: 1, or 2 for the single retry of a failed run.
   */
  attempts: number;
}

/** Outcome of one discovery pass over all configured repositories. */
export interface DiscoverResult {
  /** Pull requests to start a run for. */
  candidates: Candidate[];
  /**
   * Tracked pull requests found merged or closed in this pass; their latest run
   * is now marked retired.
   */
  retired: Array<{ repo: string; number: number; run: string; state: string }>;
  /**
   * Pull requests left alone, with the reason; `number` is 0 when the whole
   * repository was skipped.
   */
  skipped: Array<{ repo: string; number: number; reason: string }>;
}

/**
 * The fields of a pull request read from `gh pr list` / `gh pr view` (see
 * LIST_FIELDS).
 */
interface PrListItem {
  number: number; headRefOid: string; title: string; url: string; baseRefName: string;
  isDraft: boolean; author?: { login?: string; is_bot?: boolean };
}
interface PrView extends PrListItem { state: string }

const LIST_FIELDS = 'number,headRefOid,title,url,baseRefName,isDraft,author';

/**
 * Milliseconds since the head commit was committed; Infinity when unknown. One call per requested
 * pull request: asking the list query for commits exceeds GitHub's GraphQL node limit.
 */
async function headAge(repo: string, sha: string, now: Date): Promise<number> {
  const date = (await gh(['api', `repos/${repo}/commits/${sha}`, '--jq', '.commit.committer.date']).catch(() => ({ stdout: '' }))).stdout.trim();
  const t = date ? Date.parse(date) : NaN;
  return Number.isNaN(t) ? Infinity : now.getTime() - t;
}
/**
 * GitHub search for open, non-draft pull requests that ask the authenticated
 * account for a review.
 */
export const REQUESTED_SEARCH = 'user-review-requested:@me is:open draft:false';

/**
 * The commit a run reviewed: its recorded identity, else a pull request's head
 * SHA; undefined when neither is known.
 */
function identityOf(run: RunRecord): string | undefined {
  return run.identity ?? (run.target.kind === 'pr' ? run.target.head_sha : undefined);
}

/** The run whose review.md a rereview should compare against: the latest finished run, else its own prior. */
function priorFor(run: RunRecord): string | undefined {
  return run.status === 'done' ? run.id : run.prior_run;
}

/**
 * Marks the run retired with the pull request's final state, rewrites its
 * run.json and appends a `retired` event to the index.
 */
async function recordRetired(runsDir: string, run: RunRecord, state: string): Promise<void> {
  const at = new Date().toISOString();
  run.retired = { at, state };
  run.updated_at = at;
  await writeFile(join(runsDir, run.id, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
  await appendIndex(runsDir, { run: run.id, event: 'retired', state });
}

/**
 * The requested source and the tracked source, with the skip, retry and retire rules. Only pull
 * requests where the bot is a requested reviewer start a review: new commits on a tracked pull
 * request are reviewed only once someone requests the bot again. A requested head younger than
 * settleMs waits for a later poll, so a series of pushes is reviewed once, at its last head.
 */
export async function discover(input: DiscoverInput): Promise<DiscoverResult> {
  const result: DiscoverResult = { candidates: [], retired: [], skipped: [] };
  const latest = await latestRunsByPr(input.runsDir);
  const handled = new Set<string>();
  const requestedKeys = new Set<string>();
  const now = input.now ?? new Date();
  const settleMs = input.settleMs ?? SETTLE_MS;

  for (const repo of input.repos) {
    let requested: PrListItem[];
    try {
      requested = await ghJson<PrListItem[]>(['pr', 'list', '--repo', repo, '--search', REQUESTED_SEARCH, '--json', LIST_FIELDS, '--limit', '100']);
    } catch (err) {
      result.skipped.push({ repo, number: 0, reason: `gh-error: ${(err as Error).message}` });
      continue;
    }
    // The search answers [] for a repository the token cannot read, so an empty list proves nothing.
    if (requested.length === 0) {
      try {
        await gh(['api', `repos/${repo}`, '--jq', '.full_name']);
      } catch (err) {
        result.skipped.push({ repo, number: 0, reason: `unreadable: ${(err as Error).message}` });
        continue;
      }
    }
    for (const pr of requested) {
      if (pr.isDraft || pr.author?.is_bot) continue;
      const key = prKey(repo, pr.number);
      requestedKeys.add(key);
      if (await headAge(repo, pr.headRefOid, now) < settleMs) {
        handled.add(key);
        result.skipped.push({ repo, number: pr.number, reason: 'settling' });
        continue;
      }
      const run = latest.get(key);
      const base = { repo, number: pr.number, head_sha: pr.headRefOid, title: pr.title, url: pr.url, base: pr.baseRefName };
      if (!run) {
        handled.add(key);
        result.candidates.push({ action: 'review', ...base, reason: 'requested', attempts: 1 });
      } else if (run.status === 'done' && run.delivery?.posted_sha) {
        // GitHub cleared the request when the bot posted; its presence now means someone asked again.
        handled.add(key);
        result.candidates.push({ action: 'rereview', ...base, reason: 're-requested', prior_run: run.id, attempts: 1 });
      }
      // otherwise the tracked rule below decides
    }
  }

  for (const [key, run] of latest) {
    if (handled.has(key) || run.target.kind !== 'pr' || run.retired) continue;
    const { repo, number } = run.target;
    if (!input.repos.includes(repo)) continue;
    let live: PrView;
    try {
      live = await ghJson<PrView>(['pr', 'view', String(number), '--repo', repo, '--json', `${LIST_FIELDS},state`]);
    } catch (err) {
      result.skipped.push({ repo, number, reason: `gh-error: ${(err as Error).message}` });
      continue;
    }
    if (live.state !== 'OPEN') {
      await recordRetired(input.runsDir, run, live.state);
      result.retired.push({ repo, number, run: run.id, state: live.state });
      continue;
    }
    if (live.isDraft) { result.skipped.push({ repo, number, reason: 'draft' }); continue; }
    if (live.author?.is_bot) { result.skipped.push({ repo, number, reason: 'bot' }); continue; }
    if (IN_FLIGHT.includes(run.status)) { result.skipped.push({ repo, number, reason: 'in-flight' }); continue; }
    const base = { repo, number, head_sha: live.headRefOid, title: live.title, url: live.url, base: live.baseRefName };
    const prior = priorFor(run);
    if (live.headRefOid !== identityOf(run)) {
      if (!requestedKeys.has(key)) { result.skipped.push({ repo, number, reason: 'not-requested' }); continue; }
      const c: Candidate = { action: prior ? 'rereview' : 'review', ...base, reason: 'new-commits', attempts: 1 };
      if (prior) c.prior_run = prior;
      result.candidates.push(c);
    } else if (run.status === 'failed' && run.attempts < 2) {
      const c: Candidate = { action: run.action, ...base, reason: 'retry', retry_of: run.id, attempts: 2 };
      if (run.prior_run) c.prior_run = run.prior_run;
      result.candidates.push(c);
    } else if (run.status === 'failed') {
      result.skipped.push({ repo, number, reason: 'retried' });
    } else {
      result.skipped.push({ repo, number, reason: 'unchanged' });
    }
  }
  return result;
}
