#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { discover } from '../lib/discover.ts';
import { cleanRetired, finishRun, newRun, requestFromCandidate, setStatus, statusSummary, updateRun, type Intake } from '../lib/lifecycle.ts';
import { prepareRun } from '../lib/prepare.ts';
import { initDeployment, parseClaudeUpdate, updateDeployment } from '../lib/deployment.ts';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
import { readRun } from '../lib/runs.ts';
import { isTargetKind, type Config, type Request } from '../lib/types.ts';
import type { Candidate } from '../lib/discover.ts';

const FRAMEWORK = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/** Prints `msg` and the command summary to stderr and exits 2. */
function usage(msg: string): never {
  process.stderr.write(`cra: ${msg}
usage: cra [--deployment DIR] <command>
  run new --request FILE [--intake agent-link|poll] [--from NAME] [--conversation ID]
  run from-candidate --candidate FILE
  run prepare ID
  run usage ID --type T --input N --output N
  run finish ID --outcome done|failed [--failure MSG]
  run show ID
  status
  discover
  retire-clean
  init --dir DIR --company <url|path> --workspace NAME [--link] [--name N] [--notify PEER] [--identity BOT]
       [--poll MIN] [--max-concurrent N] [--local-root DIR]... [--agent-link PATH] [--image IMG]
       [--hub-port P]
  update [--dir DIR]
  check-update
  restart-window
`);
  process.exit(2);
}

interface Deployment { dir: string; runsDir: string; clonesDir: string; companyDir: string | null; config: Config }

/**
 * Reads a deployment directory: its config.yaml (empty when missing or
 * unreadable) and its runs, clones and company paths. The company directory is
 * null when it does not exist.
 */
async function loadDeployment(dir: string): Promise<Deployment> {
  const d = resolve(dir);
  let config: Config = {};
  try { config = (parse(await readFile(join(d, 'config.yaml'), 'utf8')) ?? {}) as Config; } catch { /* no config: defaults */ }
  let companyDir: string | null = join(d, 'company');
  try { await readFile(join(companyDir, 'defaults.yaml'), 'utf8'); } catch {
    try { await (await import('node:fs/promises')).access(companyDir); } catch { companyDir = null; }
  }
  return { dir: d, runsDir: join(d, 'runs'), clonesDir: join(d, 'clones'), companyDir, config };
}

/**
 * Checks a request's action and target shape, exiting with usage on a bad one;
 * a missing id becomes '' for newRun to assign.
 */
function validateRequest(raw: unknown): Request {
  if (typeof raw !== 'object' || raw === null) usage('request must be an object');
  const r = raw as Record<string, unknown>;
  if (r['action'] !== 'review' && r['action'] !== 'rereview') usage('request.action must be review or rereview');
  const t = r['target'] as Record<string, unknown> | undefined;
  if (!t || typeof t['kind'] !== 'string' || !isTargetKind(t['kind'])) usage('request.target.kind must be pr | audit | local');
  if (t['kind'] === 'pr' && (typeof t['repo'] !== 'string' || typeof t['number'] !== 'number')) usage('a pr target needs repo and number');
  if (t['kind'] === 'audit' && typeof t['repo'] !== 'string') usage('an audit target needs repo');
  if (t['kind'] === 'local' && typeof t['path'] !== 'string') usage('a local target needs path');
  const req = raw as Request;
  return { ...req, id: typeof r['id'] === 'string' ? r['id'] : '' };
}

/**
 * Dispatches the `cra` subcommands. init, update, check-update and
 * restart-window run without a deployment; the rest load the one at
 * `--deployment` or the current directory. `run prepare` exits 5 when the run
 * is blocked.
 */
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      deployment: { type: 'string' }, request: { type: 'string' }, candidate: { type: 'string' },
      intake: { type: 'string' }, from: { type: 'string' }, conversation: { type: 'string' },
      type: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' },
      outcome: { type: 'string' }, failure: { type: 'string' },
      dir: { type: 'string' }, company: { type: 'string' }, workspace: { type: 'string' }, link: { type: 'boolean', default: false },
      name: { type: 'string' }, notify: { type: 'string' }, identity: { type: 'string' }, poll: { type: 'string' },
      'max-concurrent': { type: 'string' }, 'local-root': { type: 'string', multiple: true }, 'agent-link': { type: 'string' },
      image: { type: 'string' }, 'hub-port': { type: 'string' },
    },
    allowPositionals: true, strict: true,
  });
  const [cmd, sub, id] = positionals;

  // Commands that do not need an existing deployment.
  if (cmd === 'init') {
    if (!values.dir) usage('--dir is required');
    if (!values.company) usage('--company is required');
    if (!values.workspace) usage('--workspace is required');
    const g = await initDeployment({
      dir: values.dir, frameworkDir: FRAMEWORK, company: values.company, link: values.link, workspace: values.workspace,
      ...(values.name ? { name: values.name } : {}), ...(values.notify ? { notify: values.notify } : {}), ...(values.identity ? { identity: values.identity } : {}),
      ...(values.poll ? { pollMinutes: Number(values.poll) } : {}), ...(values['max-concurrent'] ? { maxConcurrent: Number(values['max-concurrent']) } : {}),
      ...(values['local-root'] ? { localRoots: values['local-root'] } : {}), ...(values['agent-link'] ? { agentLinkPath: values['agent-link'] } : {}),
      ...(values.image ? { image: values.image } : {}), ...(values['hub-port'] ? { hubPort: Number(values['hub-port']) } : {}),
    });
    process.stdout.write(`deployment written to ${resolve(values.dir)} (${g.files.length} generated files). Next: read DEPLOYMENT.md there.\n`);
    return;
  }
  if (cmd === 'update') {
    const dir = resolve(values.dir ?? values.deployment ?? process.cwd());
    const g = await updateDeployment(dir, FRAMEWORK);
    process.stdout.write(`re-rendered ${g.files.length} files in ${dir}\n`);
    try {
      await exec('docker', ['compose', 'exec', '-T', '-u', 'reviewer', 'reviewer', 'cra', 'restart-window'], { cwd: dir });
      process.stdout.write('coordinator window restart requested\n');
    } catch {
      process.stdout.write('container not running; start it with: docker compose up -d\n');
    }
    return;
  }
  if (cmd === 'check-update') {
    let out = '';
    try {
      const r = await exec('claude', ['update'], { timeout: 120_000 });
      out = r.stdout + r.stderr;
    } catch (err) {
      const e = err as { code?: string; stdout?: string; stderr?: string };
      if (e.code === 'ENOENT') { process.stderr.write('cra: claude not found on PATH\n'); process.exit(1); }
      out = (e.stdout ?? '') + (e.stderr ?? '');
    }
    const p = parseClaudeUpdate(out);
    process.stdout.write(p.updated ? `updated ${p.from} ${p.to}\n` : p.unknown ? `unknown: ${out.trim().split('\n').pop() ?? ''}\n` : 'up-to-date\n');
    return;
  }
  if (cmd === 'restart-window') {
    try {
      await exec('tmux', ['has-session', '-t', 'coordinator']);
    } catch {
      process.stderr.write('cra: no tmux session named coordinator\n');
      process.exit(1);
    }
    // Detached: when the coordinator calls this from its own turn, /exit only runs once the turn
    // ends, and the helper must outlive this process to answer the dialogs that follow.
    const logDir = join(homedir(), '.cra');
    await mkdir(logDir, { recursive: true });
    const log = openSync(join(logDir, 'restart.log'), 'a');
    spawn('bash', [join(FRAMEWORK, 'scripts', 'restart-window.sh')], { detached: true, stdio: ['ignore', log, log] }).unref();
    process.stdout.write('restart requested: a helper sends /exit and answers the exit and channel dialogs (log: ~/.cra/restart.log); runs in flight are never stopped\n');
    return;
  }

  const dep = await loadDeployment(values.deployment ?? process.cwd());

  switch (cmd) {
    case 'run': {
      switch (sub) {
        case 'new': {
          if (!values.request) usage('--request is required');
          const request = validateRequest(JSON.parse(await readFile(values.request, 'utf8')));
          const intake = (values.intake ?? 'agent-link') as Intake;
          if (intake !== 'agent-link' && intake !== 'poll') usage('--intake must be agent-link or poll');
          const run = await newRun({ runsDir: dep.runsDir, request, source: { intake, ...(values.conversation ? { conversation_id: values.conversation } : {}), ...(values.from ? { from: values.from } : {}) } });
          process.stdout.write(run.id + '\n');
          return;
        }
        case 'from-candidate': {
          if (!values.candidate) usage('--candidate is required');
          const c = JSON.parse(await readFile(values.candidate, 'utf8')) as Candidate;
          const { request, extra } = requestFromCandidate(c);
          const run = await newRun({ runsDir: dep.runsDir, request, source: { intake: 'poll' }, attempts: extra.attempts, head_sha: extra.head_sha, ...(extra.retry_of ? { retry_of: extra.retry_of } : {}), ...(extra.prior_run ? { prior_run: extra.prior_run } : {}) });
          process.stdout.write(run.id + '\n');
          return;
        }
        case 'prepare': {
          if (!id) usage('run id is required');
          const r = await prepareRun({ runsDir: dep.runsDir, id, clonesDir: dep.clonesDir, companyDir: dep.companyDir, frameworkDir: FRAMEWORK, config: dep.config });
          if (r.blocked) { process.stdout.write(JSON.stringify({ blocked: true, reason: r.reason }) + '\n'); process.exit(5); }
          process.stdout.write(JSON.stringify(r.dispatch, null, 2) + '\n');
          return;
        }
        case 'usage': {
          if (!id) usage('run id is required');
          if (!values.type) usage('--type is required');
          const input = Number(values.input ?? 0), output = Number(values.output ?? 0);
          await updateRun(join(dep.runsDir, id), (r) => {
            const u = ((r as unknown as { usage?: Record<string, { input: number; output: number }> }).usage ??= {});
            u[values.type!] = { input, output };
          });
          return;
        }
        case 'finish': {
          if (!id) usage('run id is required');
          if (values.outcome !== 'done' && values.outcome !== 'failed') usage('--outcome must be done or failed');
          const run = await finishRun(dep.runsDir, id, values.outcome, values.failure);
          process.stdout.write(JSON.stringify({ id: run.id, status: run.status }) + '\n');
          return;
        }
        case 'show': {
          if (!id) usage('run id is required');
          const run = await readRun(join(dep.runsDir, id));
          let dispatch: unknown = null;
          try { dispatch = JSON.parse(await readFile(join(dep.runsDir, id, 'dispatch.json'), 'utf8')); } catch { /* not prepared yet */ }
          process.stdout.write(JSON.stringify({ run, dispatch }, null, 2) + '\n');
          return;
        }
        default: usage(`unknown run subcommand ${String(sub)}`);
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'status': {
      const s = await statusSummary(dep.runsDir);
      const lines = ['| status | count |', '|---|---|', ...Object.entries(s.counts).filter(([, n]) => n > 0).map(([k, n]) => `| ${k} | ${n} |`)];
      if (s.inFlight.length) lines.push('', '| in flight | status | target | since |', '|---|---|---|---|', ...s.inFlight.map((r) => `| ${r.id} | ${r.status} | ${r.target} | ${r.since} |`));
      if (s.recent.length) lines.push('', '| recent | status | target | verdict | updated |', '|---|---|---|---|---|', ...s.recent.map((r) => `| ${r.id} | ${r.status} | ${r.target} | ${r.verdict ?? ''} | ${r.updated_at} |`));
      process.stdout.write(lines.join('\n') + '\n');
      return;
    }
    case 'discover': {
      const repos = dep.config.github?.repos ?? [];
      const result = await discover({ repos, runsDir: dep.runsDir });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    case 'retire-clean': {
      process.stdout.write(JSON.stringify(await cleanRetired(dep.runsDir)) + '\n');
      return;
    }
    default: usage(`unknown command ${String(cmd)}`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`cra: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
