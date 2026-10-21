# Phase 2: prep-target, discover, post-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three deterministic tools between a request and a posted review: `prep-target` (bash) materialises a PR, an audit checkout or a local snapshot into a run directory; `discover` (TypeScript) lists PRs to review or re-review from GitHub plus the run history; `post-review` (TypeScript) computes the verdict from the merged findings block and posts it as the bot.

**Architecture:** Each tool reads and writes only the run directory and the long-lived clones. The run record (`run.json`) and the findings-block parser are shared libraries, because phase 3's coordinator and the merger contract depend on them. GitHub access goes through the `gh` CLI, authenticated by `GH_TOKEN` in the deployment, and every test replaces `gh` with a stub on `PATH`.

**Tech Stack:** bash + `git` + `gh` + `jq` for `prep-target` (bats tests with fixture repositories), TypeScript on Node 24 for `discover` and `post-review` (`node --test` with a `gh` stub), `yaml` for parsing the findings block.

**Spec:** `docs/superpowers/specs/2026-10-11-code-review-ai-design.md` §6.2 (run directory, statuses), §7.2 (discovery rules), §8 (target preparation and order), §9.1–§9.3 (findings block, merged review, verdict rule), §10 (delivery), §12 (security).

---

## Cross-phase contracts fixed here

**`run.json`** (one per run; the coordinator writes it in phase 3, these tools read and amend it):

```ts
interface RunRecord {
  id: string;                                   // <ts>-<repo slug>-<number> or <ts>-local-<basename>
  action: 'review' | 'rereview';
  status: 'queued' | 'preparing' | 'reviewing' | 'merging' | 'delivering' | 'done' | 'failed' | 'blocked';
  target:
    | { kind: 'pr'; repo: string; number: number; head_sha?: string; url?: string; base?: string }
    | { kind: 'audit'; repo: string; ref: string; sha?: string; paths?: string[] }
    | { kind: 'local'; path: string; ref: string; head_sha?: string; paths?: string[] };
  identity?: string;                            // what discover compares; set by prep-target
  attempts: number;                             // 1 on a first run, 2 on the single retry
  retry_of?: string;
  prior_run?: string;                           // the run whose review.md is the prior review
  retired?: { at: string; state: string };      // set by discover; never re-checked
  source: { intake: 'agent-link' | 'poll'; conversation_id?: string; from?: string };
  created_at: string;
  updated_at: string;
  types?: string[];
  delivery?: { posted_sha?: string; verdict?: 'approve' | 'request-changes' | 'comment'; posted_at?: string; verdict_disagreement?: string };
  failure?: string;
}
```

**`meta/target.json`** (written by `prep-target`): `{ kind, identity, head_sha?, merge_base?, base_ref?, sha?, snapshot?: { head, patch_sha256, untracked: number } }`.

**`discover` output** (stdout JSON):

```ts
interface Candidate { action: 'review' | 'rereview'; repo: string; number: number; head_sha: string; title: string; url: string; base: string; reason: 'requested' | 're-requested' | 'new-commits' | 'retry'; prior_run?: string; retry_of?: string; attempts: number }
interface DiscoverResult { candidates: Candidate[]; retired: Array<{ repo: string; number: number; run: string; state: string }>; skipped: Array<{ repo: string; number: number; reason: string }> }
```

**`review.md`** (written by the merger in phase 3, read by `post-review`): frontmatter, then the first fenced ```` ```yaml ```` block is the merged findings block (a bare list, or a mapping with `findings:` and optional `withdrawn:`), then prose whose first non-empty line is the verdict line.

---

## File structure

```
scripts/lib/common.sh            log_info/log_warn/die, json helpers
scripts/prep-target.sh           subcommands: pr | audit | local | siblings
src/lib/runs.ts                  RunRecord type, readRun/writeRun, listRuns, latestRunsByPr, appendIndex
src/lib/findings.ts              parseReview(): frontmatter, findings block, withdrawn, prose; computeVerdict(); proseIdsNotInBlock()
src/lib/gh.ts                    thin exec wrapper around `gh` with JSON parsing
src/lib/discover.ts              discover(): the two sources and the §7.2 rules
src/lib/post-review.ts           postReview(): guards, verdict, body adaptation, gh call, run.json update
src/cli/discover.ts, src/cli/post-review.ts, bin/discover, bin/post-review
tests/helpers/gh-stub.ts         programmable `gh` stub installed on PATH for tests
tests/helpers/fixture-repo.sh    bash helpers to build git fixtures for bats
tests/prep-target.bats           bats suite
```

---

### Task 1: Run records library

**Files:**
- Create: `src/lib/runs.ts`, `src/lib/runs.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTree, removeTree } from '../../tests/helpers/tmp.ts';
import { appendIndex, latestRunsByPr, listRuns, readRun, writeRun, type RunRecord } from './runs.ts';

function rec(id: string, extra: Partial<RunRecord> = {}): RunRecord {
  return {
    id, action: 'review', status: 'done', attempts: 1,
    target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'aaa' },
    source: { intake: 'poll' }, created_at: `2026-10-11T10:00:0${id.length % 10}Z`, updated_at: '2026-10-11T10:05:00Z',
    ...extra,
  };
}

test('write/read round trip and listRuns ignores non-run dirs', async () => {
  const runs = await makeTree({ 'junk.txt': 'x', 'notarun/README': 'y' });
  await writeRun(runs, rec('r1'));
  await writeRun(runs, rec('r2', { status: 'failed' }));
  const back = await readRun(join(runs, 'r1'));
  assert.equal(back.id, 'r1');
  const all = await listRuns(runs);
  assert.deepEqual(all.map((r) => r.id).sort(), ['r1', 'r2']);
  await removeTree(runs);
});

test('latestRunsByPr picks the newest by created_at for each (repo, number)', async () => {
  const runs = await makeTree({});
  await writeRun(runs, rec('a', { created_at: '2026-10-11T10:00:00Z', target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'old' } }));
  await writeRun(runs, rec('b', { created_at: '2026-10-11T11:00:00Z', target: { kind: 'pr', repo: 'acme/widgets', number: 7, head_sha: 'new' } }));
  await writeRun(runs, rec('c', { target: { kind: 'pr', repo: 'acme/widgets', number: 8, head_sha: 'x' } }));
  await writeRun(runs, rec('d', { target: { kind: 'local', path: '/p', ref: 'main' } }));
  const latest = await latestRunsByPr(runs);
  assert.equal(latest.get('acme/widgets#7')?.id, 'b');
  assert.equal(latest.get('acme/widgets#8')?.id, 'c');
  assert.equal(latest.size, 2);
  await removeTree(runs);
});

test('appendIndex appends one JSON line', async () => {
  const runs = await makeTree({});
  await appendIndex(runs, { run: 'r1', status: 'queued' });
  await appendIndex(runs, { run: 'r1', status: 'done' });
  const lines = (await readFile(join(runs, 'index.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].status, 'done');
  assert.ok(lines[1].ts);
  await removeTree(runs);
});
```

- [x] **Step 2: Run to verify failure**

Run: `node --test --no-warnings=ExperimentalWarning src/lib/runs.test.ts`

- [x] **Step 3: Implement**

```ts
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TargetKind } from './types.ts';

export type RunStatus = 'queued' | 'preparing' | 'reviewing' | 'merging' | 'delivering' | 'done' | 'failed' | 'blocked';
export const IN_FLIGHT: readonly RunStatus[] = ['queued', 'preparing', 'reviewing', 'merging', 'delivering', 'blocked'];

export type RunTarget =
  | { kind: 'pr'; repo: string; number: number; head_sha?: string; url?: string; base?: string }
  | { kind: 'audit'; repo: string; ref: string; sha?: string; paths?: string[] }
  | { kind: 'local'; path: string; ref: string; head_sha?: string; paths?: string[] };

export interface RunRecord {
  id: string;
  action: 'review' | 'rereview';
  status: RunStatus;
  target: RunTarget;
  identity?: string;
  attempts: number;
  retry_of?: string;
  source: { intake: 'agent-link' | 'poll'; conversation_id?: string; from?: string };
  created_at: string;
  updated_at: string;
  types?: string[];
  delivery?: { posted_sha?: string; verdict?: 'approve' | 'request-changes' | 'comment'; posted_at?: string; verdict_disagreement?: string };
  failure?: string;
}

export function prKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export async function readRun(runDir: string): Promise<RunRecord> {
  return JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8')) as RunRecord;
}

export async function writeRun(runsDir: string, run: RunRecord): Promise<void> {
  const dir = join(runsDir, run.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run.json'), JSON.stringify(run, null, 2) + '\n', 'utf8');
}

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

export async function appendIndex(runsDir: string, entry: Record<string, unknown>): Promise<void> {
  await mkdir(runsDir, { recursive: true });
  await appendFile(join(runsDir, 'index.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

export function targetKindOf(run: RunRecord): TargetKind {
  return run.target.kind;
}
```

- [x] **Step 4: Run, typecheck, commit**

```bash
git add src/lib/runs.ts src/lib/runs.test.ts
git commit -m "feat(runs): run record library — read/write, list, latest per PR, index"
```

---

### Task 2: Findings parser and verdict rule

**Files:**
- Create: `src/lib/findings.ts`, `src/lib/findings.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, parseReview, proseIdsNotInBlock } from './findings.ts';

const review = `---
run: r1
target_kind: pr
head_sha: abc
---
\`\`\`yaml
- id: security-1
  severity: major
  relation: caused-by-change
  fix_cost: trivial
  fix_risk: contained
  title: Token logged
  location: a.go:1
  evidence: "log.Printf(token)"
  verified: true
  recommendation: blocks
  sources: [security]
- id: testing-2
  severity: minor
  relation: adjacent
  fix_cost: trivial
  fix_risk: contained
  title: Missing edge case
  location: a_test.go:9
  evidence: "no empty input case"
  verified: true
  recommendation: fix-now
  sources: [testing]
\`\`\`

**BLOCKING** — 2 findings.

- **Major** security-1 … (a.go:1)
- **Minor** testing-2 … (a_test.go:9)
`;

test('parseReview splits frontmatter, block and prose', () => {
  const r = parseReview(review);
  assert.equal(r.frontmatter['run'], 'r1');
  assert.equal(r.findings.length, 2);
  assert.deepEqual(r.withdrawn, []);
  assert.match(r.prose, /^\*\*BLOCKING\*\*/);
  assert.equal(r.verdictLine, '**BLOCKING** — 2 findings.');
});

test('mapping form with withdrawn is accepted', () => {
  const r = parseReview('---\nrun: r\n---\n```yaml\nfindings:\n  - id: security-1\n    severity: nit\n    recommendation: optional\nwithdrawn:\n  - id: security-3\n    reason: fixed\n```\nNON-BLOCKING — mergeable.\n');
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.withdrawn, [{ id: 'security-3', reason: 'fixed' }]);
});

test('computeVerdict: blocks on major+blocks, approve otherwise, comment when forced', () => {
  const r = parseReview(review);
  assert.equal(computeVerdict(r.findings, 'verdict'), 'request-changes');
  assert.equal(computeVerdict(r.findings.filter((f) => f.id !== 'security-1'), 'verdict'), 'approve');
  assert.equal(computeVerdict(r.findings, 'comment'), 'comment');
  assert.equal(computeVerdict([{ id: 'x-1', severity: 'critical', recommendation: 'follow-up' }], 'verdict'), 'approve');
});

test('proseIdsNotInBlock finds ghosts and ignores withdrawn ids', () => {
  const r = parseReview(review + '\nAlso see security-9 and testing-2.\n');
  assert.deepEqual(proseIdsNotInBlock(r), ['security-9']);
  const w = parseReview('---\nr: 1\n---\n```yaml\nfindings: []\nwithdrawn:\n  - id: security-3\n    reason: fixed\n```\nWithdrawn: security-3.\n');
  assert.deepEqual(proseIdsNotInBlock(w), []);
});

test('missing block throws', () => {
  assert.throws(() => parseReview('---\nr: 1\n---\nno block here\n'), /findings block/);
});
```

- [x] **Step 2: Run to verify failure**, then **Step 3: Implement**

```ts
import { parse } from 'yaml';
import { REVIEW_TYPES } from './types.ts';

export type Severity = 'critical' | 'major' | 'minor' | 'nit';
export type Recommendation = 'blocks' | 'fix-now' | 'optional' | 'follow-up';

export interface Finding {
  id: string;
  severity: Severity;
  recommendation: Recommendation;
  relation?: string;
  fix_cost?: string;
  fix_risk?: string;
  title?: string;
  location?: string;
  evidence?: string;
  verified?: boolean;
  sources?: string[];
  merged_from?: string[];
}

export interface Withdrawn { id: string; reason?: string }

export interface ParsedReview {
  frontmatter: Record<string, unknown>;
  findings: Finding[];
  withdrawn: Withdrawn[];
  prose: string;
  verdictLine: string | null;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const BLOCK_RE = /```ya?ml\r?\n([\s\S]*?)\r?\n```/;

function asFindings(v: unknown): Finding[] {
  if (!Array.isArray(v)) throw new Error('findings block: findings must be a list');
  return v.map((f, i) => {
    if (typeof f !== 'object' || f === null) throw new Error(`findings block: entry ${i} is not a mapping`);
    const o = f as Record<string, unknown>;
    if (typeof o['id'] !== 'string') throw new Error(`findings block: entry ${i} has no id`);
    if (!['critical', 'major', 'minor', 'nit'].includes(String(o['severity']))) throw new Error(`findings block: ${o['id']} has invalid severity ${String(o['severity'])}`);
    if (!['blocks', 'fix-now', 'optional', 'follow-up'].includes(String(o['recommendation']))) throw new Error(`findings block: ${o['id']} has invalid recommendation ${String(o['recommendation'])}`);
    return o as unknown as Finding;
  });
}

export function parseReview(text: string): ParsedReview {
  const fm = FM_RE.exec(text);
  const frontmatter = fm ? ((parse(fm[1] ?? '') as Record<string, unknown>) ?? {}) : {};
  const rest = fm ? text.slice(fm[0].length) : text;
  const block = BLOCK_RE.exec(rest);
  if (!block) throw new Error('review has no fenced yaml findings block');
  const raw: unknown = parse(block[1] ?? '') ?? [];
  let findings: Finding[];
  let withdrawn: Withdrawn[] = [];
  if (Array.isArray(raw)) {
    findings = asFindings(raw);
  } else if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    findings = asFindings(o['findings'] ?? []);
    if (o['withdrawn'] !== undefined) {
      if (!Array.isArray(o['withdrawn'])) throw new Error('findings block: withdrawn must be a list');
      withdrawn = o['withdrawn'] as Withdrawn[];
    }
  } else {
    throw new Error('findings block: must be a list or a mapping');
  }
  const prose = rest.slice(block.index + block[0].length).replace(/^\s+/, '');
  const verdictLine = prose.split('\n').find((l) => l.trim().length > 0)?.trim() ?? null;
  return { frontmatter, findings, withdrawn, prose, verdictLine };
}

/** §9.3: critical/major with recommendation blocks → request-changes; else approve; comment when the project forces it. */
export function computeVerdict(findings: readonly Pick<Finding, 'severity' | 'recommendation'>[], form: 'verdict' | 'comment'): 'approve' | 'request-changes' | 'comment' {
  if (form === 'comment') return 'comment';
  const blocking = findings.some((f) => (f.severity === 'critical' || f.severity === 'major') && f.recommendation === 'blocks');
  return blocking ? 'request-changes' : 'approve';
}

const ID_RE = new RegExp(`\\b(?:${REVIEW_TYPES.join('|')})-\\d+\\b`, 'g');

/** Finding ids mentioned in prose that exist neither in the block nor in the withdrawn list. */
export function proseIdsNotInBlock(r: ParsedReview): string[] {
  const known = new Set<string>([...r.findings.map((f) => f.id), ...r.withdrawn.map((w) => w.id)]);
  const seen = new Set<string>();
  for (const m of r.prose.matchAll(ID_RE)) if (!known.has(m[0])) seen.add(m[0]);
  return [...seen];
}

export function verdictLineSays(line: string | null): 'blocking' | 'non-blocking' | null {
  if (!line) return null;
  if (/non-blocking/i.test(line)) return 'non-blocking';
  if (/blocking/i.test(line)) return 'blocking';
  return null;
}
```

- [x] **Step 4: Run, typecheck, commit**

```bash
git add src/lib/findings.ts src/lib/findings.test.ts
git commit -m "feat(findings): parse merged review, compute verdict, detect ghost ids in prose"
```

---

### Task 3: `gh` wrapper and test stub

**Files:**
- Create: `src/lib/gh.ts`, `tests/helpers/gh-stub.ts`, `tests/helpers/gh-stub.test.ts`

The stub is a Node script installed as `gh` in a temp `bin/` directory the test prepends to `PATH`. It reads `GH_STUB_SPEC`, a JSON file with `responses: [{ match: "pr view 7 --repo acme/widgets", stdout, exit? }]` (prefix match on the space-joined args, first wins) and appends every invocation's args to `GH_STUB_LOG`. Unmatched invocations exit 1 with `gh-stub: no response for <args>`.

- [x] **Step 1: Write `src/lib/gh.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface GhResult { stdout: string; stderr: string }

export class GhError extends Error {
  readonly args: string[];
  readonly code: number | string | null;
  readonly stderr: string;
  constructor(args: string[], code: number | string | null, stderr: string) {
    super(`gh ${args.join(' ')} failed (${String(code)}): ${stderr.trim()}`);
    this.args = args; this.code = code; this.stderr = stderr;   // no parameter properties: erasableSyntaxOnly
  }
}

export async function gh(args: string[]): Promise<GhResult> {
  try {
    const r = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, env: process.env });
    return { stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number | string; stderr?: string };
    throw new GhError(args, e.code ?? null, e.stderr ?? e.message);
  }
}

export async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await gh(args);
  return JSON.parse(stdout) as T;
}
```

- [x] **Step 2: Write the stub**

`tests/helpers/gh-stub.ts`:

```ts
import { chmod, mkdir, readFile, writeFile, appendFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface GhResponse { match: string; stdout?: string; exit?: number; stderr?: string }

export interface GhStub {
  binDir: string;
  specPath: string;
  logPath: string;
  env: NodeJS.ProcessEnv;
  calls(): Promise<string[][]>;
  setResponses(responses: GhResponse[]): Promise<void>;
}

const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const joined = args.join(' ');
fs.appendFileSync(process.env.GH_STUB_LOG, JSON.stringify(args) + '\\n');
const spec = JSON.parse(fs.readFileSync(process.env.GH_STUB_SPEC, 'utf8'));
const hit = (spec.responses || []).find((r) => joined.startsWith(r.match));
if (!hit) { process.stderr.write('gh-stub: no response for ' + joined + '\\n'); process.exit(1); }
if (hit.stdout) process.stdout.write(hit.stdout);
if (hit.stderr) process.stderr.write(hit.stderr);
process.exit(hit.exit || 0);
`;

export async function installGhStub(responses: GhResponse[] = []): Promise<GhStub> {
  const root = await mkdtemp(join(tmpdir(), 'gh-stub-'));
  const binDir = join(root, 'bin');
  await mkdir(binDir);
  const script = join(binDir, 'gh');
  await writeFile(script, SCRIPT, 'utf8');
  await chmod(script, 0o755);
  const specPath = join(root, 'spec.json');
  const logPath = join(root, 'calls.log');
  await writeFile(logPath, '');
  const stub: GhStub = {
    binDir, specPath, logPath,
    env: { ...process.env, PATH: `${binDir}:${process.env['PATH']}`, GH_STUB_SPEC: specPath, GH_STUB_LOG: logPath },
    async calls() {
      const text = await readFile(logPath, 'utf8');
      return text.trim() ? text.trim().split('\n').map((l) => JSON.parse(l) as string[]) : [];
    },
    async setResponses(rs) { await writeFile(specPath, JSON.stringify({ responses: rs }), 'utf8'); },
  };
  await stub.setResponses(responses);
  return stub;
}
```

Test (`tests/helpers/gh-stub.test.ts`): install with one response, `execFile('gh', ['pr','view','7'], { env: stub.env })` returns the stdout, `calls()` has one entry, an unmatched call rejects.

Because `gh.ts` uses `process.env`, tests of `discover`/`post-review` set `process.env.PATH`/`GH_STUB_*` from `stub.env` at the start of each test (and restore after), or spawn the CLI with `env: stub.env`. The library tests below do the former via a helper `withEnv(stub.env, fn)`.

- [x] **Step 3: Run, typecheck, commit**

```bash
git add src/lib/gh.ts tests/helpers/gh-stub.ts tests/helpers/gh-stub.test.ts
git commit -m "feat: gh wrapper and a programmable gh stub for tests"
```

---

### Task 4: discover

**Files:**
- Create: `src/lib/discover.ts`, `src/lib/discover.test.ts`, `src/cli/discover.ts`, `bin/discover`

Rules (spec §7.2), implemented in `discover(input)`:

1. For each configured repo: `gh pr list --repo R --search "user-review-requested:@me is:open draft:false" --json number,headRefOid,title,url,baseRefName,isDraft,author --limit 100`, filter `isDraft === false && !author.is_bot`.
2. `latestRunsByPr(runsDir)` is the record.
3. Requested PR with no run → `review`, reason `requested`.
   Requested PR whose latest run is `done` with `delivery.posted_sha` → `rereview`, reason `re-requested` (even if SHA unchanged).
   Otherwise fall through to the tracked rule.
4. Tracked: every latest run with `target.kind === 'pr'` whose repo is configured and that is not `retired`. Fetch live state with `gh pr view N --repo R --json number,headRefOid,title,url,baseRefName,state,isDraft,author`. If `state !== 'OPEN'` → retired. If the run is in flight (`IN_FLIGHT`) → skipped `in-flight`. If live `headRefOid !== run.identity ?? run.target.head_sha` → `rereview`, reason `new-commits` (if the run was `failed`, still `new-commits`). Else if `run.status === 'failed'` and `run.attempts < 2` → same action as the failed run, reason `retry`, `retry_of: run.id`, `attempts: 2`. Else skipped `unchanged`.
5. A PR that is both requested and tracked is handled once: the requested rule first, then tracked only if the requested rule fell through.
6. Draft or bot PRs in the tracked set are skipped with reason `draft`/`bot`.
7. `gh` failures for one PR are recorded in `skipped` with reason `gh-error: …`; they never abort the tick.

- [x] **Step 1: Write the failing tests** (abridged list; write them all)

Use `installGhStub` with responses for `pr list --repo acme/widgets` and `pr view N --repo acme/widgets`, and a `runs/` tree built with `writeRun`. Cases:

- fresh requested PR → one `review` candidate `requested`.
- requested PR with a done run that has `posted_sha` and same SHA → `rereview` `re-requested`.
- requested PR with a done run **without** `posted_sha` (posting never) and same SHA → skipped `unchanged` (no loop).
- tracked PR, not requested, head advanced → `rereview` `new-commits` with `prior_run`.
- tracked PR in `reviewing` with head advanced → skipped `in-flight`.
- tracked PR `blocked` → skipped `in-flight`.
- tracked `failed` run attempts 1, same SHA → candidate reason `retry`, `attempts: 2`, `retry_of`.
- tracked `failed` run attempts 2 → skipped `retried`.
- tracked PR now `MERGED` → in `retired`, not in candidates.
- bot author in requested list → excluded; draft in tracked → skipped `draft`.
- `pr view` failing → skipped `gh-error`.
- repo not in config but present in runs → ignored.

- [x] **Step 2: Implement `src/lib/discover.ts`**

```ts
import { ghJson } from './gh.ts';
import { IN_FLIGHT, latestRunsByPr, prKey, type RunRecord } from './runs.ts';

export interface DiscoverInput { repos: string[]; runsDir: string; identity?: string }

export interface Candidate {
  action: 'review' | 'rereview';
  repo: string; number: number; head_sha: string; title: string; url: string; base: string;
  reason: 'requested' | 're-requested' | 'new-commits' | 'retry';
  prior_run?: string; retry_of?: string; attempts: number;
}
export interface DiscoverResult {
  candidates: Candidate[];
  retired: Array<{ repo: string; number: number; run: string; state: string }>;
  skipped: Array<{ repo: string; number: number; reason: string }>;
}

interface PrListItem { number: number; headRefOid: string; title: string; url: string; baseRefName: string; isDraft: boolean; author: { login?: string; is_bot?: boolean } }
interface PrView extends PrListItem { state: string }

const LIST_FIELDS = 'number,headRefOid,title,url,baseRefName,isDraft,author';

function identityOf(run: RunRecord): string | undefined {
  return run.identity ?? (run.target.kind === 'pr' ? run.target.head_sha : undefined);
}

export async function discover(input: DiscoverInput): Promise<DiscoverResult> {
  const result: DiscoverResult = { candidates: [], retired: [], skipped: [] };
  const latest = await latestRunsByPr(input.runsDir);
  const handled = new Set<string>();

  for (const repo of input.repos) {
    let requested: PrListItem[] = [];
    try {
      requested = await ghJson<PrListItem[]>(['pr', 'list', '--repo', repo, '--search', 'user-review-requested:@me is:open draft:false', '--json', LIST_FIELDS, '--limit', '100']);
    } catch (err) {
      result.skipped.push({ repo, number: 0, reason: `gh-error: ${(err as Error).message}` });
      continue;
    }
    for (const pr of requested) {
      if (pr.isDraft || pr.author?.is_bot) continue;
      const key = prKey(repo, pr.number);
      const run = latest.get(key);
      if (!run) {
        handled.add(key);
        result.candidates.push({ action: 'review', repo, number: pr.number, head_sha: pr.headRefOid, title: pr.title, url: pr.url, base: pr.baseRefName, reason: 'requested', attempts: 1 });
      } else if (run.status === 'done' && run.delivery?.posted_sha) {
        handled.add(key);
        result.candidates.push({ action: 'rereview', repo, number: pr.number, head_sha: pr.headRefOid, title: pr.title, url: pr.url, base: pr.baseRefName, reason: 're-requested', prior_run: run.id, attempts: 1 });
      }
      // otherwise: fall through to the tracked rule below
    }
  }

  for (const [key, run] of latest) {
    if (handled.has(key) || run.target.kind !== 'pr') continue;
    const { repo, number } = run.target;
    if (!input.repos.includes(repo)) continue;
    let live: PrView;
    try {
      live = await ghJson<PrView>(['pr', 'view', String(number), '--repo', repo, '--json', `${LIST_FIELDS},state`]);
    } catch (err) {
      result.skipped.push({ repo, number, reason: `gh-error: ${(err as Error).message}` });
      continue;
    }
    if (live.state !== 'OPEN') { result.retired.push({ repo, number, run: run.id, state: live.state }); continue; }
    if (live.isDraft) { result.skipped.push({ repo, number, reason: 'draft' }); continue; }
    if (live.author?.is_bot) { result.skipped.push({ repo, number, reason: 'bot' }); continue; }
    if (IN_FLIGHT.includes(run.status)) { result.skipped.push({ repo, number, reason: 'in-flight' }); continue; }
    const base = { repo, number, head_sha: live.headRefOid, title: live.title, url: live.url, base: live.baseRefName };
    if (live.headRefOid !== identityOf(run)) {
      result.candidates.push({ action: 'rereview', ...base, reason: 'new-commits', prior_run: run.id, attempts: 1 });
    } else if (run.status === 'failed' && run.attempts < 2) {
      result.candidates.push({ action: run.action, ...base, reason: 'retry', retry_of: run.id, attempts: 2, ...(run.retry_of || run.action === 'rereview' ? { prior_run: run.id } : {}) });
    } else if (run.status === 'failed') {
      result.skipped.push({ repo, number, reason: 'retried' });
    } else {
      result.skipped.push({ repo, number, reason: 'unchanged' });
    }
  }
  return result;
}
```

- [x] **Step 3: CLI `src/cli/discover.ts`**: `--config config.yaml --runs DIR [--out file]`; reads `github.repos` from the config; prints the JSON result (or writes it to `--out`); exit 0 even when `skipped` has errors; exit 2 on usage. `bin/discover` wrapper like the others.

- [x] **Step 4: Run, typecheck, commit**

```bash
git add src/lib/discover.ts src/lib/discover.test.ts src/cli/discover.ts bin/discover
git commit -m "feat(discover): two-source PR discovery with re-request, in-flight, retry and retire rules"
```

---

### Task 5: post-review

**Files:**
- Create: `src/lib/post-review.ts`, `src/lib/post-review.test.ts`, `src/cli/post-review.ts`, `bin/post-review`

`postReview({ runDir, dryRun })`:

1. Read `run.json`, `plan.json`, `review.md`. Refuse (exit 3, message) when `run.target.kind !== 'pr'`, when `plan.posting.post !== true`, or when `plan.posting.needsHuman`.
2. `parseReview`. Refuse (exit 4) when `proseIdsNotInBlock` is non-empty, naming the ids.
3. `verdict = computeVerdict(findings, plan.posting.form)`. Compare with `verdictLineSays(verdictLine)`: if the line says blocking and verdict is approve (or the reverse), record `delivery.verdict_disagreement` with both.
4. Body: prose only (frontmatter and block dropped), then a footer line:
   `---\n*Automated review · run <id> · types: a, b · <n> finding(s)*`. Write to `posted.md`.
5. Unless `dryRun`: `gh pr review <number> --repo <repo> --<verdict> --body-file posted.md`. On success set `run.delivery = { posted_sha: run.target.head_sha ?? run.identity, verdict, posted_at, verdict_disagreement? }`, `updated_at`, write `run.json`, `appendIndex({ run, event: 'posted', verdict })`.
6. Return `{ verdict, posted: !dryRun, disagreement }`.

- [x] **Step 1: Write the failing tests** — cases:

- happy path approve: `gh` called with `['pr','review','7','--repo','acme/widgets','--approve','--body-file', <posted.md>]`; `run.json` gains `delivery.posted_sha === head_sha`; `posted.md` has no frontmatter and no ```` ```yaml ```` block and ends with the footer.
- major+blocks → `--request-changes`.
- `plan.posting.form === 'comment'` → `--comment`.
- verdict line says BLOCKING but computed approve → posted approve, `verdict_disagreement` recorded.
- ghost id in prose → rejects with exit code 4, no `gh` call.
- audit run → rejects exit 3, no `gh` call.
- `plan.posting.post === false` → rejects exit 3.
- `dryRun` → `posted.md` written, no `gh` call, `run.json` unchanged.
- `gh` failing → rejects, `run.json` unchanged.

Model refusals as a `PostRefused extends Error { code: 3 | 4 }`; the CLI maps `code` to the exit status.

- [x] **Step 2: Implement** `src/lib/post-review.ts` (per the steps above) and the CLI (`--run DIR [--dry-run]`), `bin/post-review`.

- [x] **Step 3: Run, typecheck, commit**

```bash
git add src/lib/post-review.ts src/lib/post-review.test.ts src/cli/post-review.ts bin/post-review
git commit -m "feat(post-review): verdict from the merged findings block, body adaptation, gh pr review as the bot"
```

---

### Task 6: prep-target (bash) and its bats suite

**Files:**
- Create: `scripts/lib/common.sh`, `scripts/prep-target.sh`, `tests/helpers/fixture-repo.sh`, `tests/prep-target.bats`
- Modify: `package.json` (add `"test:bats": "bats tests"` and make `test` run both)

Interface:

```
prep-target pr      --run-dir DIR --clones-dir DIR --repo owner/name --number N [--head-sha SHA]
prep-target audit   --run-dir DIR --clones-dir DIR --repo owner/name --ref REF [--path P]...
prep-target local   --run-dir DIR --path /host/path [--base REF] [--path-scope P]...
prep-target siblings --run-dir DIR --clones-dir DIR --plan plan.json
```

All subcommands create `RUN/target/` and `RUN/meta/` and write `RUN/meta/target.json`; they print nothing on success and exit non-zero with a message on failure. `siblings` prints a JSON array of clone paths.

Shared helpers in `prep-target.sh`:

- `ensure_clone REPO CLONES_DIR` → prints clone path `CLONES_DIR/<owner>-<name>`; clones with `gh repo clone REPO PATH -- --quiet` when absent; otherwise `git fetch --quiet origin` and `git remote set-head origin --auto`. Uses `flock` on `<clone>/.git/cra.lock` around fetch and worktree operations (copied from the old `prep_pr.sh`).
- `write_files_json CLONE_OR_TREE ...` helpers using `git -C … diff --name-only -z` / `git ls-files -z` → JSON array via `jq -R . | jq -s .`.
- `extract_code_review TREEISH CLONE OUT_DIR`: `git -C CLONE archive TREEISH .code-review 2>/dev/null | tar -x -C OUT_DIR --strip-components=1` when `git cat-file -e TREEISH:.code-review`; always `mkdir -p OUT_DIR`.

`pr`:
1. `clone=$(ensure_clone)`; `git fetch origin pull/N/head`; `head_sha` default from `gh pr view N --repo R --json headRefOid -q .headRefOid`.
2. `base=$(gh pr view N --repo R --json baseRefName -q .baseRefName)`; `git fetch origin "$base"`; `merge_base=$(git merge-base origin/$base $head_sha)`.
3. `git worktree add --quiet --detach RUN/target $head_sha` (remove a stale one first).
4. `git diff --binary $merge_base $head_sha > RUN/meta/diff.patch`; `git diff --name-only -z $merge_base $head_sha` → `files.json`.
5. `gh pr view N --repo R --json title,body,url,baseRefName,headRefName,author,state,isDraft,comments,reviews,reviewRequests,commits > RUN/meta/pr.json`.
6. `extract_code_review $merge_base` → `RUN/meta/target-guidelines/`.
7. `target.json`: `{kind: pr, repo, number, head_sha, base_ref, merge_base, identity: head_sha}`.

`audit`:
1. ensure clone, `git fetch origin`; `sha=$(git rev-parse --verify "origin/$ref^{commit}" || git rev-parse --verify "$ref^{commit}")`.
2. worktree at `sha`; `files.json` from `git ls-files -z -- "${paths[@]}"` in the worktree; copy `target/.code-review` → `meta/target-guidelines/`.
3. `target.json`: `{kind: audit, repo, ref, sha, paths, identity: "<sha>:<sha256 of paths joined>"}`.

`local`:
1. Validate `--path` is a git work tree (`git -C PATH rev-parse --show-toplevel`); refuse otherwise.
2. `git clone --quiet --no-hardlinks PATH RUN/target` (origin = PATH, so `origin/<branch>` resolves to the source's branches).
3. `git -C PATH diff --binary HEAD > RUN/meta/worktree.patch`; if non-empty, `git -C RUN/target apply --whitespace=nowarn RUN/meta/worktree.patch`.
4. Untracked: `git -C PATH ls-files --others --exclude-standard -z | tar --null -C PATH -T - -cf - | tar -C RUN/target -xf -`; count them.
5. `base`: `--base`, else the source's own default branch read read-only from the source (`git -C PATH symbolic-ref --short refs/remotes/origin/HEAD`, stripped of `origin/`, used as `origin/<name>` inside the snapshot), else `origin/main`, `origin/master`, and only then the snapshot's `origin/HEAD` (which is the source's checked-out branch, not its default); `merge_base=$(git -C RUN/target merge-base $base HEAD)`.
6. `git -C RUN/target diff --binary $merge_base > RUN/meta/diff.patch` (committed-since-base plus working-tree changes, untracked files are included because they are now in the tree: add `--no-index`? No: use `git -C RUN/target add -N .` first so untracked files appear in `diff` as new files, then diff; do not commit).
7. `files.json`: `git -C RUN/target diff --name-only -z $merge_base`.
8. copy `target/.code-review` → `meta/target-guidelines/`.
9. identity: `head=$(git -C PATH rev-parse HEAD)`; `patch_sha=$(sha256sum worktree.patch)`; untracked hash **by content** (`ls-files --others --exclude-standard -z | sort -z | xargs -0 sha256sum | sha256sum`, never from a tar stream, which embeds mtimes); `identity="${head}:${patch_sha:0:16}:${untracked_sha:0:16}"`; `target.json` with `snapshot: {head, patch_sha256, untracked}`. `--run-dir` is made absolute first (`git -C` rebases relative paths). `git worktree prune` runs before every `worktree add`.
10. Never write to PATH: every git command against PATH is read-only (`diff`, `ls-files`, `rev-parse`); verify in a test by making the fixture read-only (`chmod -R a-w`) and checking the subcommand still succeeds and the source tree's mtime set is unchanged.

`siblings`: `jq -r '.siblings[]' plan.json | while read repo; do ensure_clone; done` → JSON array of paths.

bats fixtures (`tests/helpers/fixture-repo.sh`): `make_remote NAME` creates a bare repo with `main` (two commits, including `.code-review/manifest.yaml` at the first commit only in one variant) and a PR branch with `refs/pull/7/head`; `make_gh_stub` writes a `gh` shim that maps `repo clone owner/name path` → `git clone <bare> path`, `pr view 7 --repo owner/name --json …` → canned JSON (headRefOid computed from the fixture), `-q .headRefOid` and `-q .baseRefName` variants.

bats cases: pr happy path (worktree at head, diff non-empty, files.json lists the changed file, `.code-review` extracted from the merge-base and **not** from the PR head when the PR adds one, target.json identity equals head); pr stale worktree replaced; audit at ref with path scope (files.json filtered, no diff.patch); local with a modified tracked file and an untracked file (both in diff.patch and files.json, identity changes when the file changes, identical identity on a second run, source tree untouched and read-only); local refuses a non-git path; siblings clones from plan.json and prints paths; every subcommand refuses missing required args with exit 2.

- [x] **Step 1: Write fixtures and the bats file** with the cases above (write each case failing first against an empty script, then implement).

- [x] **Step 2: Implement `scripts/lib/common.sh` and `scripts/prep-target.sh`**, run `shellcheck` if available.

- [x] **Step 3: Run**: `bats tests/prep-target.bats` and `pnpm test`; commit

```bash
git add scripts tests/helpers/fixture-repo.sh tests/prep-target.bats package.json
git commit -m "feat(prep-target): PR worktree, audit checkout, local read-only snapshot, siblings"
```

---

### Task 7: Docs and close-out

- [x] **Step 1: Write `docs/runs-and-tools.md`**: the run directory layout and `run.json` fields; the fixed order `prep-target → resolve-run → prep-target siblings → compose-prompt × N → specialists → merger → post-review`; each tool's CLI and exit codes; the `gh` stub for tests.
- [x] **Step 2: Link from README; `pnpm test` and `bats tests` green; commit.**
- [x] **Step 3: Close the phase's task** with notes on what landed.
