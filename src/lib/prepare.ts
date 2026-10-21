import { machineSettings } from './machine.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compose } from './compose.ts';
import { modelAlias, type ModelAlias } from './models.ts';
import { resolveRun } from './resolve.ts';
import { setStatus, updateRun } from './lifecycle.ts';
import { readRun, type RunRecord } from './runs.ts';
import type { TaskInput } from './task-block.ts';
import type { Config, Plan, Request } from './types.ts';

const exec = promisify(execFile);

/**
 * Where a run lives and the layers and config prepareRun reads to prepare it.
 */
export interface PrepareInput {
  /** Directory holding one subdirectory per run. */
  runsDir: string;
  /**
   * Run id; its directory is `runsDir/id` and must already hold request.json
   * and run.json.
   */
  id: string;
  /**
   * Cache of repository clones that prep-target checks out targets and siblings
   * from.
   */
  clonesDir: string;
  /** Company guidelines layer, or null when the deployment has none. */
  companyDir: string | null;
  /** Framework root; prep-target.sh is taken from its `scripts/` directory. */
  frameworkDir: string;
  /**
   * Deployment config.yaml, used for resolve-run and default specialist and
   * merger models.
   */
  config: Config;
  /** environment for the spawned prep-target script (tests inject a gh shim) */
  env?: NodeJS.ProcessEnv;
}

/** One specialist the orchestrator launches, as written into dispatch.json. */
export interface DispatchSpecialist { type: string; prompt: string; output: string; model: ModelAlias; effort?: string; warning?: string }
/**
 * dispatch.json: everything the orchestrator needs to run the specialists,
 * merge and deliver.
 */
export interface Dispatch {
  /** Run id. */
  run: string;
  /** Specialists to launch, one per planned review type. */
  specialists: DispatchSpecialist[];
  /**
   * Merger's output path (the run's review.md), model alias (sonnet by default)
   * and optional effort.
   */
  merger: { output: string; model: ModelAlias; effort?: string };
  /** Posting decision copied from plan.json. */
  posting: Plan['posting'];
  /**
   * Where the run came from, so the result is reported back to the same
   * requester.
   */
  notify: RunRecord['source'];
  /**
   * Path of the prior run's review.md for a rereview, or null when there is
   * none or it is missing.
   */
  priorReview: string | null;
}

/**
 * Either the dispatch that was written, or the reason the run was set blocked.
 */
export type PrepareResult = { blocked: false; dispatch: Dispatch } | { blocked: true; reason: string };

/**
 * meta/target.json as written by prep-target; which fields are set depends on
 * the target kind.
 */
interface TargetMeta {
  kind: string; identity: string; head_sha?: string; base_ref?: string; merge_base?: string; sha?: string;
}

/** Whether the path is accessible; never throws. */
async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Runs prep-target.sh with the given arguments and returns its stdout. On
 * failure throws an error naming the subcommand and the first `error:` line of
 * stderr (or its last line).
 */
async function prepTarget(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  try {
    const { stdout } = await exec('bash', [script, ...args], { env, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    const lines = (e.stderr ?? e.message).trim().split('\n').filter((l) => l.trim());
    const reason = lines.find((l) => /error:/.test(l)) ?? lines[lines.length - 1] ?? 'unknown error';
    throw new Error(`prep-target ${args[0]} failed: ${reason.replace(/^\[[^\]]+\] error: /, '')}`);
  }
}

/**
 * Command-line arguments for prep-target for the request's target kind. A PR
 * run whose record already pins a head sha passes it, so the review stays on
 * that commit.
 */
function prepArgs(request: Request, run: RunRecord, runDir: string, clonesDir: string): string[] {
  const t = request.target;
  switch (t.kind) {
    case 'pr': {
      const a = ['pr', '--run-dir', runDir, '--clones-dir', clonesDir, '--repo', t.repo ?? '', '--number', String(t.number ?? 0)];
      if (run.target.kind === 'pr' && run.target.head_sha) a.push('--head-sha', run.target.head_sha);
      return a;
    }
    case 'audit': {
      const a = ['audit', '--run-dir', runDir, '--clones-dir', clonesDir, '--repo', t.repo ?? '', '--ref', t.ref ?? 'main'];
      for (const p of t.paths ?? []) a.push('--path', p);
      return a;
    }
    case 'local': {
      const a = ['local', '--run-dir', runDir, '--path', t.path ?? ''];
      if (t.ref) a.push('--base', t.ref);
      for (const p of t.paths ?? []) a.push('--path-scope', p);
      return a;
    }
  }
}

/**
 * The whole deterministic pipeline of a run: prep-target, then resolve-run into
 * plan.json, then siblings, then one composed prompt and work directory per
 * specialist, then dispatch.json. A run whose posting needs a human is set
 * blocked and returns before composing; a prep-target failure sets the run
 * failed and rethrows.
 */
export async function prepareRun(input: PrepareInput): Promise<PrepareResult> {
  const env = input.env ?? process.env;
  const runDir = join(input.runsDir, input.id);
  const script = join(input.frameworkDir, 'scripts', 'prep-target.sh');
  const request = JSON.parse(await readFile(join(runDir, 'request.json'), 'utf8')) as Request;
  let run = await setStatus(input.runsDir, input.id, 'preparing');

  try {
    await prepTarget(script, prepArgs(request, run, runDir, input.clonesDir), env);
  } catch (err) {
    await setStatus(input.runsDir, input.id, 'failed', { failure: (err as Error).message });
    throw err;
  }

  const meta = JSON.parse(await readFile(join(runDir, 'meta', 'target.json'), 'utf8')) as TargetMeta;
  run = await updateRun(runDir, (r) => {
    r.identity = meta.identity;
    if (r.target.kind === 'pr') { if (meta.head_sha) r.target.head_sha = meta.head_sha; if (meta.base_ref) r.target.base = meta.base_ref; }
    if (r.target.kind === 'audit' && meta.sha) r.target.sha = meta.sha;
    if (r.target.kind === 'local') { if (meta.head_sha) r.target.head_sha = meta.head_sha; if (meta.base_ref) r.target.ref = meta.base_ref; }
  });

  const filesPath = join(runDir, 'meta', 'files.json');
  const files = JSON.parse(await readFile(filesPath, 'utf8')) as string[];
  const targetGuidelines = join(runDir, 'meta', 'target-guidelines');
  const plan = await resolveRun({
    postingMode: machineSettings().posting,
    request, config: input.config, frameworkDir: input.frameworkDir, companyDir: input.companyDir,
    targetGuidelinesDir: (await exists(targetGuidelines)) ? targetGuidelines : null, files,
  });
  await writeFile(join(runDir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  if (plan.posting.needsHuman) {
    await setStatus(input.runsDir, input.id, 'blocked', { note: plan.posting.reason });
    return { blocked: true, reason: plan.posting.reason };
  }

  let siblings: string[] = [];
  if (plan.siblings.length) {
    const out = await prepTarget(script, ['siblings', '--run-dir', runDir, '--clones-dir', input.clonesDir, '--plan', join(runDir, 'plan.json')], env);
    siblings = JSON.parse(out) as string[];
  }

  let priorReview: string | null = null;
  let priorHead: string | undefined;
  if (run.prior_run) {
    const p = join(input.runsDir, run.prior_run, 'review.md');
    if (await exists(p)) priorReview = p;
    try {
      const prior = await readRun(join(input.runsDir, run.prior_run));
      if (prior.target.kind === 'pr') priorHead = prior.target.head_sha ?? prior.identity; // a local target's identity is not a commit
    } catch { /* no prior run.json: no diff since */ }
  }
  let prTitle = '', prUrl = '';
  if (request.target.kind === 'pr') {
    try {
      const pr = JSON.parse(await readFile(join(runDir, 'meta', 'pr.json'), 'utf8')) as { title?: string; url?: string };
      prTitle = pr.title ?? ''; prUrl = pr.url ?? '';
      await updateRun(runDir, (r) => { if (r.target.kind === 'pr' && prUrl) r.target.url = prUrl; });
    } catch { /* pr.json is best effort */ }
  }

  await mkdir(join(runDir, 'prompts'), { recursive: true });
  await mkdir(join(runDir, 'findings'), { recursive: true });
  const defaults = input.config.models ?? {};
  const specialists: DispatchSpecialist[] = [];
  for (const t of plan.types) {
    const output = join(runDir, 'findings', `${t.name}.md`);
    const workDir = join(runDir, 'work', t.name);
    await mkdir(workDir, { recursive: true });
    const task: TaskInput = {
      run_id: run.id, target_kind: request.target.kind,
      ...(request.target.repo ? { repo: request.target.repo } : {}),
      ...(request.target.kind === 'pr' ? { pr: { number: request.target.number ?? 0, url: prUrl, title: prTitle, base: meta.base_ref ?? '', head_sha: meta.head_sha ?? '' } } : {}),
      ...(request.target.kind === 'audit' ? { ref: request.target.ref ?? 'main' } : {}),
      ...(request.target.kind === 'local' ? { path: request.target.path ?? '', ref: meta.base_ref ?? '' } : {}),
      ...(request.target.paths?.length ? { paths: request.target.paths } : {}),
      target_dir: join(runDir, 'target'), work_dir: workDir, meta_dir: join(runDir, 'meta'),
      ...(request.target.kind !== 'audit' ? { diff_path: join(runDir, 'meta', 'diff.patch') } : {}),
      files_path: filesPath, siblings, prior_review: priorReview, ...(priorHead ? { prior_head: priorHead } : {}),
      ...(request.context ? { requester_context: request.context } : {}),
      output_path: output,
      frontmatter: { run: run.id, type: t.name, target_kind: request.target.kind, identity: meta.identity },
    };
    await writeFile(join(runDir, 'prompts', `${t.name}.task.json`), JSON.stringify(task, null, 2) + '\n', 'utf8');
    const result = await compose({
      template: t.prompt, roots: plan.roots,
      type: t.name, kind: plan.kind, languages: plan.languages, targetKind: request.target.kind, task,
    });
    await writeFile(join(runDir, 'prompts', `${t.name}.md`), result.prompt, 'utf8');
    await writeFile(join(runDir, 'prompts', `${t.name}.resolution.json`), JSON.stringify(result.resolution, null, 2) + '\n', 'utf8');
    const m = modelAlias(t.model ?? defaults.specialist?.model);
    const effort = t.effort ?? defaults.specialist?.effort;
    specialists.push({ type: t.name, prompt: join(runDir, 'prompts', `${t.name}.md`), output, model: m.alias, ...(effort ? { effort } : {}), ...(m.warning ? { warning: m.warning } : {}) });
  }

  const mergerModel = modelAlias(defaults.merger?.model, 'sonnet');
  const dispatch: Dispatch = {
    run: run.id, specialists,
    merger: { output: join(runDir, 'review.md'), model: mergerModel.alias, ...(defaults.merger?.effort ? { effort: defaults.merger.effort } : {}) },
    posting: plan.posting, notify: run.source, priorReview,
  };
  await writeFile(join(runDir, 'dispatch.json'), JSON.stringify(dispatch, null, 2) + '\n', 'utf8');
  await updateRun(runDir, (r) => { r.types = plan.types.map((t) => t.name); });
  await setStatus(input.runsDir, input.id, 'reviewing');
  return { blocked: false, dispatch };
}
