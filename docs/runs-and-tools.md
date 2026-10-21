# Runs and the tools that drive them

A **run** is one review of one target. Everything about it lives in `runs/<run-id>/` inside a
deployment, and every tool in this repo reads and writes only that directory and the long-lived
clones under `clones/`. The coordinator is the only thing that creates runs and moves them
between states; the tools below are the deterministic steps it calls. `docs/architecture.md`
describes the whole flow.

## Run directory

```
runs/<id>/
  request.json        what was asked
  run.json            status, target, identity, attempts, delivery record
  plan.json           output of resolve-run: project, kind, languages, types, posting decision
  dispatch.json       what the coordinator dispatches: prompt path, model, effort per specialist and merger
  prompts/<type>.resolution.json   the template and every include compose-prompt considered, with hashes
  target/             worktree (pr, audit) or snapshot (local) — removed when the run is done
  work/<type>/        a specialist's scratch directory (builds, test runs) — removed when the run is done
  meta/               diff.patch, files.json, pr.json, review-comments.json, target.json, target-guidelines/
  prompts/<type>.md   one composed prompt per specialist
  findings/<type>.md  one findings file per specialist
  review.md           the merged review (merger output)
  posted.md           the body that was (or would be) posted
runs/index.jsonl      one line per state change, delivery or cleanup event, for status queries
```

`run.json` fields: `id`, `action` (`review` | `rereview`), `status` (`queued`, `preparing`,
`reviewing`, `merging`, `delivering`, `done`, `failed`, `blocked`), `target` (`kind` `pr` |
`audit` | `local` plus its coordinates), `identity` (what discovery compares: a PR's head SHA,
an audit's commit plus scope, a local snapshot's head plus content hashes), `attempts` (1, or 2
for the single retry), `retry_of`, `source` (`intake` `poll` | `agent-link`), timestamps,
`types`, `usage` (input and output tokens per subagent), `delivery` (`posted_sha`, `verdict`,
`posted_at`, `verdict_disagreement`), `failure`, `prior_run` (the run a re-review builds on) and
`retired` (set when the PR was merged or closed).

## Order of operations in a run

`cra run prepare` runs the first four steps and writes `dispatch.json`; the coordinator runs the
rest.

```
prep-target <pr|audit|local>   target/, meta/files.json, meta/target-guidelines/, meta/target.json
resolve-run                    plan.json
prep-target siblings           clones named in plan.json, paths for the task block
compose-prompt × N             prompts/<type>.md, prompts/<type>.resolution.json
specialists (subagents)        findings/<type>.md
merger (subagent)              review.md
post-review --check            validates review.md; on failure the merger is re-dispatched once
cra run finish                 status done or failed; stops leftover processes; on done removes target/ and work/
post-review                    posted.md, gh pr review, run.json delivery record
```

## Tools

### `bin/cra`

```
cra [--deployment DIR] <command>
  run new --request FILE [--intake agent-link|poll] [--from NAME] [--conversation ID]
  run from-candidate --candidate FILE
  run prepare ID          prep-target, resolve-run, siblings, compose-prompt; writes dispatch.json
  run usage ID --type T --input N --output N
  run finish ID --outcome done|failed [--failure MSG]
  run show ID
  status                  counts by status, runs in flight, recent runs
  discover                one polling pass (see bin/discover)
  retire-clean            removes the target trees of retired runs
  init ... / update       create or re-render a deployment (docs/deployment.md)
  check-update            runs `claude update`; prints whether a new version was installed
  restart-window          starts scripts/restart-window.sh detached (below)
```

The deployment directory defaults to the current directory. `run prepare` exits 5 when the run
is `blocked` on a human decision. `run finish`, with either outcome, first stops any process
still running from the run directory (its working directory, executable or an argument under
`runs/<id>/`), such as a server a specialist started and left behind: SIGTERM, then SIGKILL after
three seconds, recorded as a `stopped` event in `index.jsonl`. `run finish --outcome done` removes `work/` and `target/`
only: it makes `work/` writable first (a Go module cache is read-only), unlinks a symlinked
`work/` without following it, and writes a `cleaned` event to `index.jsonl` listing what it
removed. `review.md`, `findings/`, `prompts/`, `posted.md` and the run metadata are never
touched. A failed run keeps everything.

### `scripts/restart-window.sh`

Restarts the coordinator window unattended: types `/exit`, and when Claude Code asks whether to
stop background work, confirms only if every listed item is a scheduled task (the poll job,
which `/boot` re-creates); otherwise it chooses Stay and retries every 5 minutes, up to 24
times. It then confirms the development-channels notice of the new window. `--notice-only`
skips the exit; `window-loop.sh` runs it before every start. Log: `~/.cra/restart.log`.

### `scripts/prep-target.sh`

```
prep-target pr       --run-dir DIR --clones-dir DIR --repo owner/name --number N [--head-sha SHA]
prep-target audit    --run-dir DIR --clones-dir DIR --repo owner/name --ref REF [--path P]...
prep-target local    --run-dir DIR --path /host/path [--base REF] [--path-scope P]...
prep-target siblings --run-dir DIR --clones-dir DIR --plan plan.json
```

- `pr` fetches `pull/N/head`, checks the head SHA out as a worktree under `target/`, diffs
  against the merge-base with the base branch, writes `pr.json` (title, body, thread, reviews,
  requested reviewers) and `review-comments.json` (line comments and their replies) and extracts `.code-review/` **from the merge-base**, so a pull request
  cannot shape the rules used to review it.
- `audit` checks out `REF` and lists files (scoped by `--path`); no diff.
- `local` never writes to the source path. It clones the source's HEAD into `target/`, applies
  the working-tree patch, copies untracked non-ignored files, and diffs against the base (`--base`,
  else `origin/main`, `origin/master`, then the source's HEAD branch). The identity is the HEAD
  SHA plus content hashes of the patch and the untracked files, so an unchanged tree gives the
  same identity and a re-review request can be answered from the existing run.
- `siblings` clones the repos named under `siblings` in `plan.json` and prints their paths.

Exit codes: 0 ok, 1 failure, 2 usage.

### `bin/resolve-run`, `bin/compose-prompt`

See `docs/guideline-authoring.md`.

### `bin/discover`

```
discover --config config.yaml --runs DIR [--out result.json]
```

Prints `{ candidates, retired, skipped }`. Two sources: PRs where the bot is a requested
reviewer, and PRs with a run on record. Rules: a requested PR with no run is a `review`; a
requested PR whose latest run posted is a `rereview` even with no new commits (GitHub cleared the
request when the bot posted, so its presence means someone asked again); a requested PR whose
head moved since its latest run is a `rereview`, while a tracked PR that no longer requests the
bot is skipped as `not-requested`; a requested head committed less than five minutes ago is
skipped as `settling` and picked up by a later poll; runs in flight or blocked are skipped; a failed run is retried once as a
new run with `attempts: 2`; merged or closed PRs are retired. Bot authors and drafts are ignored.
A `gh` failure for one PR is recorded under `skipped`; the tick continues.

### `bin/post-review`

```
post-review --run DIR [--dry-run | --check]
```

`--check` only validates `review.md` and exits 4 on a problem: the findings block must parse,
every finding id must be a string, and the prose may name only ids in the block, in an entry's
`merged_from`, or withdrawn, or, on a re-review, in the block of an earlier round (the
`prior_run` chain). It reads no posting policy and calls nothing.

Refuses (exit 3) a run that is not a pull request, whose plan says not to post, that needs a
human decision, or whose PR head moved since the run started (GitHub would attach the review to
a commit nobody reviewed; the next poll reviews the new head). Refuses (exit 4) a review whose prose names a finding id absent from the findings
block. Computes the verdict from the block (any critical or major with `recommendation: blocks`
→ request-changes, else approve; comment when the project policy is comment-only; on a PR the
bot's own account opened, which GitHub lets it neither approve nor block, a comment that states the
verdict, recorded as `posted_as: comment`), writes
`posted.md` (prose only, plus a footer naming the agent and the specialists behind each
finding), posts it with `gh pr review` as the bot, and records
`delivery` in `run.json`. A verdict line that disagrees with the computed verdict is recorded,
not followed. `--dry-run` writes `posted.md` and stops.

## Testing

`pnpm test` runs the unit suites (`node --test`) and the bats suite. GitHub is never contacted:
TypeScript tests install a programmable `gh` stub (`tests/helpers/gh-stub.ts`), and the bats suite
uses fixture bare repositories plus a `gh` shim (`tests/helpers/fixture-repo.sh`) that serves
clones and canned `pr view` answers from them.
