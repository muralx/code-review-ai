# Phase 3: Coordinator, Specialists, Merger and Run Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Claude Code window into the review agent: a `cra` CLI that owns every deterministic step of a run, three prompt artefacts (coordinator `CLAUDE.md` template, `specialist` and `merger` subagent definitions), four project commands (`/boot`, `/poll`, `/run`, `/status`), and the agent-link request protocol.

**Architecture:** The model decides only what the spec leaves to judgment (reading findings, merging, talking to peers, deciding when to restart). Everything else is a `cra` subcommand: creating a run, preparing it (prep-target → resolve-run → siblings → compose-prompt), producing a dispatch list for the specialists, recording usage, finishing, posting. `cra run prepare` is the whole deterministic pipeline in one call, so the coordinator's `/run` procedure is short and the same every time.

**Tech Stack:** TypeScript on Node 24 for `cra`; markdown with YAML frontmatter for agents and commands; agent-link plugin tools inside the window; Claude Code `CronCreate` for polling.

**Facts this plan relies on (Claude Code 2.1.296):** subagent frontmatter accepts `model` (full id), `effort`, `tools`, `permissionMode`, `maxTurns`, `omitClaudeMd`; the Agent tool accepts a per-call `model` alias and `effort`; scheduled tasks are session-scoped, expire after 7 days, fire only while idle, and are restored by `claude --continue`/`--resume`; project commands in `.claude/commands/*.md` take `$ARGUMENTS`; a session cannot exit itself, only a `/exit` keystroke can; `claude update` installs to disk and the running session keeps the old binary until restart.

**Spec:** §3, §4.3a, §6, §7.1, §7.2, §9.2, §11.

---

## File structure

```
src/lib/lifecycle.ts        run ids, newRun, setStatus, finishRun (drops target/), cleanRetired, statusSummary   [done]
src/lib/prepare.ts          prepareRun(): prep-target → resolve-run → siblings → compose × N → dispatch.json
src/lib/models.ts           model id → Agent tool alias; default effort
src/lib/render.ts           {{placeholder}} rendering for the coordinator template and commands
src/cli/cra.ts              cra run new | from-candidate | prepare | dispatch | usage | finish | show ; cra status ; cra discover
bin/cra
agents/specialist.md        subagent definition (generic)
agents/merger.md            subagent definition
agents/coordinator.md       CLAUDE.md template with {{placeholders}}
agents/commands/{boot,poll,run,status}.md   project commands, copied into .claude/commands/ by cra init (phase 4)
docs/request-protocol.md    the agent-link request format and reply contract
tests: src/lib/prepare.test.ts (end-to-end with bash fixtures), src/lib/render.test.ts, src/cli/cra.test.ts
```

`dispatch.json` (written by `cra run prepare`):

```json
{
  "run": "<id>",
  "specialists": [
    { "type": "security", "prompt": "<abs>/prompts/security.md", "output": "<abs>/findings/security.md", "model": "opus", "effort": "xhigh" }
  ],
  "merger": { "output": "<abs>/review.md", "model": "sonnet", "effort": "medium" },
  "posting": { "post": true, "form": "verdict", "needsHuman": false, "reason": "project policy auto" },
  "notify": { "intake": "agent-link", "conversation_id": "cv_…", "from": "builder" }
}
```

---

### Task 1: Lifecycle library — done (committed)

`src/lib/lifecycle.ts` with tests (89 unit tests green). Commit it.

### Task 2: Model aliasing and the prepare pipeline

**Files:** `src/lib/models.ts`, `src/lib/prepare.ts`, `src/lib/prepare.test.ts`

- `modelAlias(id)`: `claude-opus-*` → `opus`, `claude-sonnet-*` → `sonnet`, `claude-haiku-*` → `haiku`, `claude-fable-*` → `fable`, already an alias → itself, unknown → `opus` with a warning in the dispatch entry.
- `prepareRun({ runsDir, id, clonesDir, companyDir, frameworkDir, config })`:
  1. `setStatus(preparing)`.
  2. Spawn `scripts/prep-target.sh <kind> …` from `request.json` (`pr`: repo, number, head sha from `run.target.head_sha` when present; `audit`: repo, ref, paths; `local`: path, ref as `--base`, paths as `--path-scope`). Failure → `failed` with the script's stderr.
  3. Read `meta/target.json`; set `run.identity`, and for `pr` `run.target.head_sha` / `base`; for `local` the snapshot head.
  4. `resolveRun` (library) → `plan.json`. If `plan.posting.needsHuman` → status `blocked`, return `{ blocked: true, reason }`.
  5. `prep-target siblings` → sibling paths.
  6. For each `plan.types`: write `prompts/<type>.task.json` (the `TaskInput`: paths from the run, `prior_review` = `runs/<prior_run>/review.md` when `run.prior_run` is set and the file exists, `requester_context` from `request.context`, frontmatter `{run, type, target_kind, identity}`), call `compose()` and write `prompts/<type>.md` + `prompts/<type>.resolution.json`.
  7. Write `dispatch.json`; `run.types = plan.types names`; `setStatus(reviewing)`.
- Test end to end: build the bash fixtures (`tests/helpers/fixture-repo.sh` via `bash -c`), a company dir (reuse `tests/fixtures/company-acme` with a project whose `repo` is `acme/widgets`), run `newRun` + `prepareRun` for a PR, assert `prompts/security.md` exists and contains the company Go replacement, `dispatch.json` lists the plan's types with aliases, status is `reviewing`; a `local` run against a clone of the fixture; a `never`+`post:true` request ends `blocked`.

### Task 3: `cra` CLI

**Files:** `src/cli/cra.ts`, `bin/cra`, `src/cli/cra.test.ts`

Subcommands (all resolve the deployment from `--deployment DIR`, default cwd; `config.yaml`, `company/`, `runs/`, `clones/` under it; framework dir = this repo):

- `cra run new --request FILE [--intake agent-link|poll] [--from NAME] [--conversation ID]` → prints the run id.
- `cra run from-candidate --candidate FILE` → run id (poll intake).
- `cra run prepare ID` → prints `dispatch.json`; exit 5 when blocked.
- `cra run usage ID --type T --input N --output N` → stores under `run.usage[T]`; `--type merger` allowed.
- `cra run finish ID --outcome done|failed [--failure MSG]`.
- `cra run show ID` → run.json + dispatch summary.
- `cra status` → `statusSummary` as a markdown table.
- `cra discover` → runs `discover()` from config and prints the result (thin wrapper so the poll command has one call).
- `cra retire-clean` → `cleanRetired`.
Exit codes: 0, 1 failure, 2 usage, 5 blocked.

### Task 4: Subagent definitions

**Files:** `agents/specialist.md`, `agents/merger.md`

`specialist.md` frontmatter: `name: specialist`, `description`, `tools: Read, Grep, Glob, Bash, Write`, `permissionMode: bypassPermissions` is **not** set here (the window runs with permissions off already; inherit), `omitClaudeMd: true` (the coordinator's CLAUDE.md is not for specialists). Body: read the prompt file named in your task first, follow it exactly, write only to the output path it names, never modify the source tree, stop when the file is written. Model and effort come per call from `dispatch.json`.

`merger.md` frontmatter: `name: merger`, `tools: Read, Glob, Write`, `omitClaudeMd: true`. Body: the §9.2 contract — read every `findings/*.md`, dedupe (same location ± 3 lines or same title → merge, highest severity, most cautious fix risk, `sources`, `merged_from`, recommendation re-derived from the triage table), order by severity, write `review.md` with frontmatter (run, target_kind, identity, types, resolution paths), the merged fenced yaml block (mapping form with `withdrawn` on rereview), the verdict line, the triage table, prose grouped by severity; audits: summary + follow-up list instead of the verdict; never add findings; never change a severity except by the merge rule.

### Task 5: Coordinator template and commands

**Files:** `agents/coordinator.md`, `agents/commands/boot.md`, `poll.md`, `run.md`, `status.md`, `src/lib/render.ts`, `src/lib/render.test.ts`

Placeholders: `{{WORKSPACE}}`, `{{AGENT_NAME}}`, `{{NOTIFY_PEER}}`, `{{DEPLOYMENT_DIR}}`, `{{FRAMEWORK_DIR}}`, `{{POLL_MINUTES}}`, `{{MAX_CONCURRENT}}`, `{{COMPANY_NAME}}`. `render(template, vars)` replaces them and throws on any left over.

`coordinator.md` sections: who you are (agent-link identity, what peers may ask); the deployment layout; **boot** (register on agent-link with the fixed name/description; `CronList`, re-arm `/poll` every `{{POLL_MINUTES}}` with an off-minute cron if missing; `cra status`; resume runs: `queued`/`preparing` → run `/run <id>`, `reviewing` with all findings present → continue at merge, `blocked` → re-send the question if no answer in the conversation); **intake over agent-link** (parse the fenced yaml request, validate, `cra run new`, acknowledge with the run id and selected types, `status` answers from `cra status`, questions about a finding answered from `findings/` and `review.md`); **processing a run** (`/run <id>`): `cra run prepare` → dispatch specialists in parallel with the Agent tool (`subagent_type: specialist`, `model`, `effort` from dispatch.json, prompt = "Your instructions are in <prompt path>. Read that file first and follow it exactly.") → record usage per specialist → token-cap check → merger → cap check → `cra run finish done` → `post-review` when `posting.post` → reply/notify; failures → `cra run finish failed`; **blocked** handling (ask the human relay with `expectation: reply`, keep working, resume on answer); **concurrency** (`{{MAX_CONCURRENT}}` runs in `reviewing`/`merging`/`delivering` at once); **updates** (on each poll tick when idle, `cra check-update`; if it reports an update installed and no run is in flight, `cra restart-window`); **retire cleanup** (`cra retire-clean` on each tick); **rules** (never post with `gh` yourself, never edit run files by hand, never modify clones, keep replies short, one clarifying question per run at most).

Commands: `/boot` (the boot procedure), `/poll` (`cra discover` → `cra run from-candidate` for each candidate up to free slots → `/run` each; `cra retire-clean`; `cra check-update`), `/run <id>` (the processing procedure), `/status` (`cra status` rendered for a peer or the human).

### Task 6: Request protocol doc and close-out

`docs/request-protocol.md`: the fenced-yaml request (fields, target grammar `owner/repo#N`, `owner/repo@ref`, `local:/path`), expectations and what each reply contains, the blocked-on-human question format, status queries, examples for a human and for an agent. Then `pnpm test`, commit, tracker close.
