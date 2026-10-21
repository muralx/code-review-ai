import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gh, ghJson } from './gh.ts';
import { blockIds, computeVerdict, parseReview, proseIdsNotInBlock, verdictLineSays, type Finding } from './findings.ts';
import { appendIndex, readRun, type RunRecord } from './runs.ts';
import type { Plan } from './types.ts';

/** A review that must not be posted; `code` is the CLI exit status. */
export class PostRefused extends Error {
  /**
   * 3 when posting is not allowed for the run (not a PR, policy, head moved); 4
   * when review.md is inconsistent.
   */
  readonly code: 3 | 4;
  /** Builds the refusal with its exit code and reason. */
  constructor(code: 3 | 4, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The run directory to post from, and whether to stop after writing posted.md.
 */
export interface PostInput { runDir: string; dryRun?: boolean }
/** What posting did, or would do on a dry run. */
export interface PostResult {
  /**
   * GitHub review event computed from the findings block and the plan's posting
   * form.
   */
  verdict: 'approve' | 'request-changes' | 'comment';
  /** False on a dry run. */
  posted: boolean;
  /**
   * Set when the review went out as a plain comment although the verdict is approve or
   * request-changes: GitHub refuses both on a pull request the bot's own account opened.
   */
  postedAs?: 'comment';
  /** Path of posted.md, the body that was (or would be) posted. */
  postedPath: string;
  /**
   * Set when the merger's verdict line contradicts the computed verdict; the
   * computed one is posted.
   */
  disagreement?: string;
}

/** One line naming the sub-reviewers (specialist types) behind each finding; empty when none are recorded. */
function foundByLine(findings: Finding[]): string {
  const parts = findings
    .filter((f) => f.sources?.length)
    .map((f) => `\`${f.id}\` ${f.sources!.join(', ')}`);
  return parts.length ? `Found by: ${parts.join(' · ')}\n\n` : '';
}

/**
 * The review prose plus a footer naming the agent, the run, its review types,
 * the finding count and who found what.
 */
function adaptBody(prose: string, run: RunRecord, findings: Finding[]): string {
  const types = run.types?.length ? run.types.join(', ') : 'n/a';
  const noun = findings.length === 1 ? 'finding' : 'findings';
  return `${prose.trimEnd()}\n\n---\n**Review by code-reviewer agent**\n\n${foundByLine(findings)}*Automated review · run ${run.id} · types: ${types} · ${findings.length} ${noun}*\n`;
}

/**
 * Ids accounted for by the earlier rounds of a re-review: the blocks of the run's prior_run, its
 * own prior_run and so on. A re-review may name them ("security-1 was withdrawn last round"). A
 * prior run that is missing or whose review.md does not parse ends the chain.
 */
export async function earlierRoundIds(runDir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const runsDir = dirname(runDir);
  const visited = new Set<string>();
  let prior = (await readRun(runDir)).prior_run;
  while (prior && !visited.has(prior)) {
    visited.add(prior);
    try {
      const dir = join(runsDir, prior);
      for (const id of blockIds(parseReview(await readFile(join(dir, 'review.md'), 'utf8')))) ids.add(id);
      prior = (await readRun(dir)).prior_run;
    } catch { break; }
  }
  return ids;
}

/**
 * What would stop review.md from being posted, whatever the posting policy: a findings block that
 * does not parse, or prose that names findings neither the block nor an earlier round holds.
 * Empty when it is fine.
 */
export async function checkReview(runDir: string): Promise<string[]> {
  let review;
  try {
    review = parseReview(await readFile(join(runDir, 'review.md'), 'utf8'));
  } catch (err) {
    return [`review.md does not parse: ${err instanceof Error ? err.message : String(err)}`];
  }
  const ghosts = proseIdsNotInBlock(review, await earlierRoundIds(runDir));
  return ghosts.length ? [`prose mentions findings absent from the block: ${ghosts.join(', ')}`] : [];
}

/**
 * Posts a pull request run's review.md as a GitHub review and records the
 * delivery in run.json and the index. Throws PostRefused when the run is not a
 * PR, its plan forbids posting or needs a human, the prose names findings
 * missing from the block, or the PR head moved since the run. A dry run writes
 * posted.md and stops.
 */
export async function postReview(input: PostInput): Promise<PostResult> {
  const run = await readRun(input.runDir);
  if (run.target.kind !== 'pr') throw new PostRefused(3, `run ${run.id} targets a ${run.target.kind}, not a pull request`);
  const plan = JSON.parse(await readFile(join(input.runDir, 'plan.json'), 'utf8')) as Plan;
  if (plan.posting.needsHuman) throw new PostRefused(3, `run ${run.id}: posting needs a human decision (${plan.posting.reason})`);
  if (plan.posting.post !== true || !plan.posting.form) throw new PostRefused(3, `run ${run.id}: posting disabled (${plan.posting.reason})`);

  const review = parseReview(await readFile(join(input.runDir, 'review.md'), 'utf8'));
  const ghosts = proseIdsNotInBlock(review, await earlierRoundIds(input.runDir));
  if (ghosts.length) throw new PostRefused(4, `run ${run.id}: prose mentions findings absent from the block: ${ghosts.join(', ')}`);

  const verdict = computeVerdict(review.findings, plan.posting.form);
  const said = verdictLineSays(review.verdictLine);
  let disagreement: string | undefined;
  if (plan.posting.form === 'verdict' && said && ((said === 'blocking') !== (verdict === 'request-changes'))) {
    disagreement = `merger wrote "${review.verdictLine}" but the block computes ${verdict}`;
  }

  const postedPath = join(input.runDir, 'posted.md');
  await writeFile(postedPath, adaptBody(review.prose, run, review.findings), 'utf8');
  if (input.dryRun) return { verdict, posted: false, postedPath, ...(disagreement ? { disagreement } : {}) };

  // A push during the run would get this verdict, since GitHub attaches a review to the current head: refuse, and the next poll reviews the new head.
  let ownPr = false;
  if (run.target.head_sha) {
    const live = await ghJson<{ headRefOid: string; author?: { login?: string } }>(['pr', 'view', String(run.target.number), '--repo', run.target.repo, '--json', 'headRefOid,author']);
    if (live.headRefOid !== run.target.head_sha) {
      throw new PostRefused(3, `run ${run.id}: head moved from ${run.target.head_sha.slice(0, 7)} to ${live.headRefOid.slice(0, 7)} during the run; the next poll reviews the new head`);
    }
    if (live.author?.login && verdict !== 'comment') {
      const bot = (await gh(['api', 'user', '--jq', '.login'])).stdout.trim();
      ownPr = bot.toLowerCase() === live.author.login.toLowerCase();
    }
  }
  // GitHub lets no account approve or request changes on its own pull request: post the same body as a comment, which says so.
  if (ownPr) {
    const label = verdict === 'approve' ? 'Approve' : 'Request changes';
    await writeFile(postedPath, `> **Verdict: ${label}.** Posted as a comment: this pull request was opened by the review bot's own account, which GitHub does not let approve or request changes.\n\n${await readFile(postedPath, 'utf8')}`, 'utf8');
  }
  await gh(['pr', 'review', String(run.target.number), '--repo', run.target.repo, `--${ownPr ? 'comment' : verdict}`, '--body-file', postedPath]);

  const now = new Date().toISOString();
  run.delivery = {
    ...(run.delivery ?? {}),
    posted_sha: run.target.head_sha ?? run.identity ?? '',
    verdict,
    posted_at: now,
    ...(disagreement ? { verdict_disagreement: disagreement } : {}),
    ...(ownPr ? { posted_as: 'comment' as const, posted_as_reason: 'pull request opened by the bot account' } : {}),
  };
  run.updated_at = now;
  await writeFile(join(input.runDir, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
  await appendIndex(dirname(input.runDir), { run: run.id, event: 'posted', verdict, posted_sha: run.delivery.posted_sha });
  return { verdict, posted: true, postedPath, ...(ownPr ? { postedAs: 'comment' as const } : {}), ...(disagreement ? { disagreement } : {}) };
}
