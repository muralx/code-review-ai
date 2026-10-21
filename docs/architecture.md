# Architecture

code-review-ai is a framework for autonomous code-review agents. A company deploys it once:
one container runs a Claude Code **coordinator** that takes review requests over agent-link and
from its own GitHub polling, runs one **specialist** subagent per review type, has a **merger**
subagent combine their findings, and delivers the result as a file, an agent-link reply and,
for pull requests, a GitHub review posted as the company's bot account.

This document describes the system as it is. The original design and the reasons behind each
decision are in `docs/history/2026-10-11-design.md`.

## Pieces

```
 host
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  agent-link hub ◄── coding agents, the human relay, other peers           │
 │       ▲                                                                   │
 │  ┌────┴──────────── docker compose project (one per company) ───────────┐ │
 │  │ reviewer container: non-root, egress allowlist                       │ │
 │  │                                                                      │ │
 │  │ supervisor ─► tmux "coordinator" ─► window-loop ─► claude (/boot)    │ │
 │  │                                                                      │ │
 │  │ coordinator (CLAUDE.md)                                              │ │
 │  │   /poll every N min ── cra discover ─┐                               │ │
 │  │   agent-link request ── cra run new ─┴─► runs/<id>/                  │ │
 │  │   /run <id>:                                                         │ │
 │  │     cra run prepare   prep-target → resolve-run → siblings →         │ │
 │  │                       compose-prompt × N → dispatch.json             │ │
 │  │     Agent(specialist) × N  ─► findings/<type>.md                     │ │
 │  │     Agent(merger)          ─► review.md ─► post-review --check       │ │
 │  │     cra run finish ─► post-review ─► agent-link reply                │ │
 │  │                                                                      │ │
 │  │ mounts: deployment dir (/deployment, rw) · claude home (volume)      │ │
 │  │         local roots (ro, same paths as on the host)                  │ │
 │  └──────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────────────────────────────────────────┘
```

| Role | Defined in | Does |
|---|---|---|
| Coordinator | `agents/coordinator.md` → the deployment's `CLAUDE.md`; commands `agents/commands/{boot,poll,run,status}.md` | Intake, run state, dispatch, delivery and every agent-link conversation. It never reviews code and never edits run files by hand. |
| Specialist | `agents/specialist.md` | One generic subagent. Its prompt only says: read the composed prompt file, follow it, write the findings file it names. Identity, guidelines and task all come from that file. |
| Merger | `agents/merger.md` | Reads every `findings/<type>.md` of a run, de-duplicates, orders by severity, writes `review.md` with one merged findings block. It never adds findings. |

Everything a model does not need to decide is a deterministic tool, in TypeScript (Node 24, no
build step) under `src/` or bash under `scripts/`:

| Tool | Does |
|---|---|
| `cra` | Run lifecycle (`run new`, `run from-candidate`, `run prepare`, `run usage`, `run finish`, `run show`), `status`, `discover`, `retire-clean`, deployment (`init`, `update`), and window upkeep (`check-update`, `restart-window`). |
| `scripts/prep-target.sh` | Builds the review target: a worktree for a PR or audit, a snapshot for a local tree, plus diff, file list, PR metadata and the repository's own guidelines. Clones sibling repositories. |
| `resolve-run` | Request + config + manifests → `plan.json`: project, kind, languages, types with model, effort and template, posting decision, siblings. |
| `compose-prompt` | Expands a prompt template into one prompt per specialist, with a `resolution.json` recording every include. |
| `discover` | One polling pass over GitHub: which PRs need a review or re-review, which runs to retry, which PRs to retire. |
| `post-review` | Validates `review.md` (`--check`), computes the verdict and posts the review. The only GitHub write path. |

## Guidelines

A specialist's prompt is built from a **prompt template**: markdown in which a line that is
exactly `${root}/path.md` is replaced by that file. There are four roots: `${framework}` (this
repository), `${company}` (the company's guideline repository), `${project}` (the matched
project inside it) and `${repo}` (`.code-review/` in the reviewed repository, taken from the
merge-base for a pull request so a PR cannot change the rules it is reviewed by). The framework
ships nine review types, six project kinds, language amendments for Go, Python, TypeScript and
Java, and opt-in packs. Manifests in the company repository choose the types, models, template
and posting policy per project.

`docs/guideline-authoring.md` is the full reference.

## A run

A run is one review of one target, kept entirely in `runs/<id>/`; nothing lives only in the
coordinator's conversation, so a restart loses nothing.

```
queued → preparing → reviewing → merging → delivering → done
   └──────────┴───────────┴──────────┴───────────┴────► failed (reason in run.json)
              blocked (needs a human answer, for example posting the policy forbids)
```

1. **Intake.** An agent-link request (`docs/request-protocol.md`) becomes `cra run new`; a
   polled candidate becomes `cra run from-candidate`. Both write `request.json` and `run.json`.
2. **Prepare.** `cra run prepare` runs the deterministic pipeline and writes `dispatch.json`:
   the prompt path, model and effort of every specialist and of the merger, and the posting
   decision. Exit 5 means the run is `blocked` on a human decision.
3. **Review.** The coordinator dispatches every specialist in parallel. A specialist that
   writes no findings file is re-dispatched once; a second miss fails the run. Token usage is
   recorded per subagent (`cra run usage`) and the run fails if it exceeds
   `limits.max_tokens_per_run`.
4. **Merge.** The merger writes `review.md`. `post-review --check` then validates it: the
   findings block must parse, and the prose may name only findings that are in the block
   (or listed under `merged_from`, or withdrawn, or, on a re-review, in an earlier round's
   block). On failure the merger is re-dispatched once
   with the check's messages; a second failure fails the run. The coordinator never edits
   `review.md` itself.
5. **Finish.** `cra run finish` stops any process a specialist left running from the run
   directory. With `--outcome done` it then removes `target/` and `work/`; both are recorded in
   `runs/index.jsonl`. A failed run keeps its files for inspection.
6. **Post.** For a pull request whose plan allows posting, `post-review` computes the verdict
   from the merged block (any critical or major finding with `recommendation: blocks` →
   request changes, otherwise approve; a comment when the project policy is comment-only),
   adds a footer naming the agent and the specialists behind each finding, and posts it as the
   bot. It refuses (exit 3) when posting is not allowed or when the PR's head moved during the
   run; the next poll then reviews the new head.
7. **Deliver.** The requester gets the verdict line, counts by severity and the path of
   `review.md`; a polled run reports to the deployment's notify peer.

A failed run is retried once, as a new run, on the next polling tick.

## Polling and re-reviews

`/poll` runs as a Claude Code scheduled task inside the coordinator window. `discover` reads two
sources: PRs where the bot is a requested reviewer, and PRs that already have a run on record.
A requested PR with no run is reviewed; one whose last run posted is re-reviewed (GitHub clears
the request when the bot posts, so a request means someone asked again); a requested PR whose
head moved since its last run is re-reviewed. New commits alone start nothing: someone has to
request the bot again. A requested head committed less than five minutes ago waits for a later
poll, so a series of pushes is reviewed once, at its last head. Merged and closed PRs are
retired. A re-review is a re-check: it reads the prior review, the discussion and the commits
since, checks whether the previous round's blockers are fixed, raises only new blockers, and
lists withdrawn findings.

On a PR opened by the bot's own account, GitHub refuses both approve and request-changes, so
`post-review` posts the review as a comment that states the verdict, and records it as
`posted_as: comment`.

## The container

- **Startup.** `entrypoint.sh` (root) installs the egress firewall and drops to the `reviewer`
  user; `supervisor.sh` keeps a tmux session `coordinator` alive; `window-loop.sh` runs
  `claude update`, installs the agent-link plugin and starts Claude Code with `/boot`, again
  whenever it exits.
- **Claude Code updates.** The binary is never pinned. It lives in the `reviewer` home, a named
  volume that also keeps the login. When nothing is in flight, `/poll` runs `cra check-update`;
  after an update it calls `cra restart-window`, whose helper (`scripts/restart-window.sh`)
  sends `/exit`, confirms the exit dialog only when the poll job is all that would stop, and
  confirms the development-channels notice of the new window. `/boot` resumes from disk.
- **Containment.** An egress allowlist (Anthropic, GitHub, package registries, the host's
  hub port, the deployment's MCP servers, plus `firewall-allow.txt`), read-only mounts for local roots, a fine-grained bot
  token that can only read code and review PRs, and a deny list in `.claude/settings.json`
  for `gh` writes (PR, issue and repository subcommands, and `gh api` with a method, field or
  input flag). Reads stay allowed. Pushes are left to the token, which has no write access to
  contents, so a specialist can still push between fixture repositories in its working
  directory. Reviewed content is treated as untrusted data.

`docs/deployment.md` covers setting a deployment up and operating it.

## Repository layout

```
agents/              coordinator, specialist and merger definitions; types/<type>.md identities;
                     commands/ for the coordinator's slash commands
prompts/             prompt templates: specialist.md (default), light, full and pack templates
guidelines/          common/ policy, types/<type>/{general.md, kind/, lang/}, packs/
templates/company/   starter company guideline repository
src/                 TypeScript: cli/ entry points, lib/ logic and unit tests
bin/                 wrappers for the CLIs (cra, resolve-run, compose-prompt, discover, post-review)
scripts/             container and git plumbing: entrypoint, firewall, supervisor, window-loop,
                     restart-window, prep-target
docker/              Dockerfile and the templates cra init renders (compose, config, env,
                     settings)
tests/               fixtures, helpers, bats suites, prompt snapshots, compose smoke test
docs/                current documentation; docs/history/ for the design, plans and research
```
