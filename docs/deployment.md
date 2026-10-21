# Deploying code-review-ai for a company

One deployment is one Docker Compose project: one container running a Claude Code coordinator
window for one company, in one agent-link workspace, acting as one GitHub bot account. The
framework repository is never run directly; `cra init` renders a deployment directory from it.

## Prerequisites

- Docker Engine with Compose v2 on the host.
- Node 24 and pnpm on the host, to run `cra` from a framework checkout (`pnpm install` once).
- A company guideline repository (see `docs/guideline-authoring.md`), or a local directory to
  start from. The framework ships a starter under `templates/company/`.
- A dedicated GitHub bot account with a fine-grained personal access token scoped to the repos
  to review: `contents: read`, `pull-requests: write`, `metadata: read`. People request review
  from the bot; reviews post as the bot. Keep `contents` read-only: the token is what stops a
  push to GitHub, since the deny list allows `git push` for fixture repositories.
- The agent-link hub running on the host and reachable from the Docker bridge. The hub binds to
  loopback by default; start it with `AGENT_LINK_HOST=0.0.0.0` (or the bridge address, usually
  `172.17.0.1`). Do the same for any MCP server on the host the deployment lists (below).
- A Claude subscription or Console account to log the container's Claude Code in with.

## Build the image

```sh
docker build -f docker/Dockerfile -t code-review-ai:latest .
```

The image bundles Claude Code (installed with the native installer into the `reviewer` user's
home), `gh`, `git`, `tmux`, Node 24 + pnpm, Go, Python 3 + uv, OpenJDK 17 + Maven + Gradle,
and this framework at `/opt/code-review-ai`. agent-link is cloned at build time when the build
can reach its repository; otherwise mount a host checkout with `--agent-link` at init.

## Create a deployment

```sh
bin/cra init --dir ~/reviews/acme \
  --company git@github.com:acme/review-guidelines.git \
  --workspace acme-dev \
  --name code-reviewer --notify human --identity acme-review-bot \
  --poll 10 --max-concurrent 2 \
  --local-root /home/you/dev \
  --agent-link /home/you/dev/agent-link
```

`--company` may also be a local path; add `--link` to symlink it instead of cloning. Each
`--local-root` is mounted read-only inside the container at the same path, so `local:` review
targets need no path translation. The command writes:

| File | Owner | Purpose |
|---|---|---|
| `config.yaml` | you | repos to poll, identity, roots, limits, models, MCP servers |
| `.env` | you | `GH_TOKEN`; never commit |
| `company/` | you | the company guideline repo |
| `firewall-allow.txt` | you | extra egress hostnames |
| `compose.yaml`, `CLAUDE.md`, `.claude/`, `.mcp.json`, `.agent-link.json` | `cra update` | generated from the framework |
| `runs/`, `clones/` | the agent | run records and long-lived clones |

Then edit `config.yaml` (`github.repos`) and `.env` (`GH_TOKEN`).

## Machine settings

Several people can run the same deployment repository, each on their own machine with their own
`.env`. Discovery only picks pull requests that request a review from the account `GH_TOKEN`
belongs to, so each machine reviews the pull requests assigned to its own account. Settings
that differ per machine are environment variables in `.env`, which is never committed:

| Variable | Values | Effect |
|---|---|---|
| `CRA_POLL` | `on` (default), `off` | `off`: discovery starts nothing; the agent reviews only what it is asked for over agent-link |
| `CRA_POSTING` | `auto` (default), `comment` | `comment`: a review of a project whose policy is `auto` is posted as a comment, never as an approval or a request for changes |

The `agent_link` values in `config.yaml` may also name a variable, such as
`notify: ${CRA_NOTIFY}` for the human relay each person runs; `cra update` fills them in from
`.env`. A `local_roots` entry may name an environment variable instead of a path, such as
`${REPOS_ROOT}`; compose fills it in from `.env`, so `config.yaml` holds no machine path. Put
anything else that only one machine needs (extra mounts, networks) in `compose.override.yaml`,
which compose merges and `cra update` never touches.

## MCP servers

A deployment has no MCP servers by default. List the ones it needs under `mcp_servers` in
`config.yaml`, then run `cra update` and restart the container:

```yaml
mcp_servers:
  tickets:
    url: https://mcp.example.com/mcp                 # a host service: http://host.docker.internal:<port>/mcp
    headers: { Authorization: "Bearer ${TICKETS_TOKEN}" }   # TICKETS_TOKEN goes in .env
    specialist_tools: [get_issue, search_issues]     # what specialists may call
    note: the issue tracker; read the ticket a change refers to.
  docs:
    command: npx                                     # a stdio server started in the container
    args: ["-y", "@example/docs-mcp"]
```

`cra update` writes `.mcp.json`, enables the servers in `.claude/settings.json`, and opens each
URL's host (or, for `host.docker.internal`, its port) in the egress firewall. The coordinator can
use every tool of every server. Specialists get only the tools named under `specialist_tools`,
listed by tool name; keep those to tools that read. `note` tells specialists what the server is
for. A stdio server's command must run in the image; packages from npm or PyPI can, since the
registries are reachable.

## First start

```sh
cd ~/reviews/acme
docker compose up -d
docker compose exec -u reviewer reviewer claude        # run /login, finish in the browser, then /exit
docker compose exec -u reviewer reviewer tmux attach -t coordinator   # watch it boot; Ctrl-b d to detach
```

Always pass `-u reviewer`: the container's entrypoint starts as root to install the firewall and
the coordinator runs as `reviewer`, so a plain `exec` logs root in and sees no tmux session.
The login is stored in the `claude-home` volume and survives restarts and image rebuilds. On
start the window loop runs `claude update`, installs the agent-link plugin if needed, and starts
the coordinator with the channels flag and permission prompts off; `/boot` registers it on
agent-link, arms the poll, and resumes unfinished runs.

## Operate

- `docker compose exec -u reviewer reviewer cra status` — counts, in-flight and recent runs.
- `docker compose logs -f reviewer` — supervisor and firewall lines.
- `docker compose exec -u reviewer reviewer tmux attach -t coordinator` — the live window.
- Framework update: wait until `cra status` shows nothing in flight, pull the framework,
  rebuild the image, `bin/cra update --dir ~/reviews/acme` (re-renders the generated files and
  asks the window to restart), then `docker compose up -d --force-recreate`. Commit the
  re-rendered files if the deployment directory is a git repository. A run interrupted by a
  recreate is resumed from disk by `/boot`.
- Claude Code updates install themselves during the poll tick when nothing is running; the
  window restarts on the new version by itself. `scripts/restart-window.sh` answers Claude
  Code's exit and development-channels dialogs, so no one needs to be at the window; its log is
  `~/.cra/restart.log` inside the container.
- A run that fails is retried once automatically on the next tick. Its `target/` and `work/`
  are kept for inspection; `cra run show <id>` prints the failure.
- Egress: the container may only reach the Anthropic API, GitHub, the package registries the
  toolchains need, the host gateway on the hub port, and the MCP servers' hosts and host ports.
  Add hostnames to
  `firewall-allow.txt` and restart the container. `CRA_FIREWALL=off` in `.env` disables the
  allowlist for debugging.

## Review targets

See `docs/request-protocol.md` for how peers ask for reviews. The bot is requested as a
reviewer on GitHub for polled PRs; agent-link requests cover audits and local trees.

## Security notes

- The token in `.env` is the only credential that can write anywhere, and it can only post
  reviews on the configured repos.
- Reviewed content is untrusted. Specialists are told to report instructions found in code or
  threads as findings; the merger cannot add findings; `post-review` applies a fixed verdict
  rule and refuses reviews whose prose names findings absent from the block.
- Local roots are mounted read-only. The snapshot step never writes to the source tree.
