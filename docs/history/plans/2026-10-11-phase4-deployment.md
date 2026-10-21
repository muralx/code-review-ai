# Phase 4: Image, Compose, Firewall and `cra init` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the framework into something a company can run: a Docker image with Claude Code, the agent-link plugin and the four toolchains; a compose template per deployment; an egress allowlist; a supervisor that restarts the coordinator window after updates; and `cra init|update|check-update|restart-window`.

**Architecture:** `cra init` renders a deployment directory (config, generated prompts and commands, compose file, env file, company clone). The container starts as root only to install firewall rules and fix volume ownership, then drops to `reviewer` and runs a tmux window loop: `claude update`, ensure the plugin, start Claude Code with the channels flag and permissions off, `/boot`; on exit, loop with `--continue`. The whole `/home/reviewer` is a named volume so the Claude binary, login and plugin survive restarts and self-updates.

**Tech Stack:** Debian bookworm image; Node 24 + pnpm, Go, Python 3 + uv, OpenJDK 21 + Maven + Gradle; `gh`, `git`, `jq`, `tmux`, `iptables`, `gosu`; TypeScript for `cra`.

**Spec:** §4 (all), §4.3a, §13.

---

## File structure

```
docker/Dockerfile                 image (framework at /opt/code-review-ai, agent-link at /opt/agent-link)
docker/compose.template.yaml      rendered into <deployment>/compose.yaml
docker/settings.json              .claude/settings.json deny list for the deployment
docker/mcp.template.json          .mcp.json pointing the issue tracker and documentation index at the host gateway
docker/config.template.yaml       config.yaml starter
docker/env.template               .env starter (GH_TOKEN)
scripts/entrypoint.sh             root: firewall, chown, gosu → supervisor
scripts/firewall.sh               iptables allowlist (domains + GitHub meta ranges + host gateway ports)
scripts/supervisor.sh             tmux session "coordinator" running window-loop.sh; keeps the container alive
scripts/window-loop.sh            claude update → ensure plugin → claude (/boot | --continue) → loop
src/lib/deployment.ts             initDeployment(), updateDeployment(), file list
src/cli/cra.ts                    + init, update, check-update, restart-window
tests: src/lib/deployment.test.ts, src/lib/check-update.test.ts; tests/smoke/compose-smoke.sh (on demand)
docs/deployment.md                how to deploy a company: prerequisites, init, login, hub binding, operations
```

---

### Task 1: Deployment rendering (`cra init`, `cra update`)

- Smoke-test finding folded in: a company directory given as a local path (symlinked) is also mounted read-only into the container at the same path, otherwise the link dangles inside.
- `initDeployment({ dir, company, workspace, name, notify, pollMinutes, maxConcurrent, companyName, identity, localRoots, hubPort, trackerUrl, docIndexUrl, frameworkDir })`:
  - creates `dir`, `runs/`, `clones/`, `.claude/agents/`, `.claude/commands/`
  - `company/`: `git clone <url>` when `company` looks like a URL or a path to a git repo elsewhere; a symlink when it is a local directory and `--link` is given
  - writes `config.yaml` (template filled), `.env` (template, `GH_TOKEN=` empty), `.agent-link.json`, `CLAUDE.md` (render `agents/coordinator.md`), `.claude/agents/{specialist,merger}.md` (copies), `.claude/commands/*.md` (rendered), `.claude/settings.json` (copy), `.mcp.json` (template), `compose.yaml` (template: bind of the deployment dir at `/deployment`, `claude-home` volume, `local_roots` as read-only binds at the same path, `extra_hosts: host.docker.internal:host-gateway`, `cap_add: [NET_ADMIN]`, `env_file: .env`), `firewall-allow.txt` (empty, commented), `DEPLOYMENT.md` (next steps)
  - records what it generated in `.cra-generated.json` (list of files + framework commit) so `update` knows what it may overwrite
- `updateDeployment({ dir, frameworkDir })`: re-renders only the files listed in `.cra-generated.json` using values read back from `config.yaml` and `.agent-link.json`; never touches `config.yaml`, `.env`, `company/`, `runs/`, `clones/`, `firewall-allow.txt`.
- Tests: init into a temp dir with `--company` as a path (symlink), assert every file exists, `CLAUDE.md` has no `{{`, `compose.yaml` parses and contains the local root as `:ro`, `.agent-link.json` has the workspace; edit `config.yaml`, run update, config unchanged and `CLAUDE.md` regenerated.

### Task 2: `cra check-update` and `cra restart-window`

- `parseClaudeUpdate(stdout)`: `Successfully updated from X to version Y` → `{ updated: true, from, to }`; "already up to date"/"latest" → `{ updated: false }`; anything else → `{ updated: false, unknown: true }`.
- `cra check-update`: runs `claude update` (60 s timeout), prints `updated <from> <to>` or `up-to-date`; exit 0 either way, exit 1 only when `claude` is missing.
- `cra restart-window`: `tmux send-keys -t coordinator "/exit" Enter`; exit 1 when the session does not exist. Prints what it did.
- `cra update` (host side) ends with `docker compose exec reviewer cra restart-window` when the container is running (best effort, prints the command otherwise).

### Task 3: Image and scripts

Dockerfile outline (single stage, layered for cache):

1. `FROM debian:bookworm-slim`; apt: `ca-certificates curl git jq tmux iptables gosu bash tar xz-utils unzip procps locales openssh-client python3 python3-venv python3-pip pipx openjdk-17-jdk-headless maven` (Debian bookworm ships OpenJDK 17; Gradle via the official zip); `gh` from the GitHub CLI apt repo; Node 24 from NodeSource; `corepack enable` → pnpm; Go from `go.dev/dl` tarball (`GO_VERSION` build arg); Gradle zip (`GRADLE_VERSION`); `uv` via its installer into `/usr/local/bin`.
2. `useradd -m -u 1000 reviewer`.
3. `COPY . /opt/code-review-ai` (framework) and `pnpm install --prod --frozen-lockfile` there; symlink `bin/*` into `/usr/local/bin`.
4. `ARG AGENT_LINK_REPO` (default the public URL once published; for now a build context path `docker/agent-link/` or a `git clone`), `pnpm install` at `/opt/agent-link`, `pnpm link:bins` as `reviewer` so `agent-link-edge` lands in `/home/reviewer/.local/bin`.
5. As `reviewer`: `curl -fsSL https://claude.ai/install.sh | bash` (native install into `~/.local`). The plugin marketplace add/install happens in `window-loop.sh` on every start (idempotent) because it needs Claude's config dir.
6. `ENV PATH=/home/reviewer/.local/bin:$PATH AGENT_LINK_HUB=http://host.docker.internal:8790 CRA_FRAMEWORK=/opt/code-review-ai`; `WORKDIR /deployment`; `ENTRYPOINT ["/opt/code-review-ai/scripts/entrypoint.sh"]`.

`entrypoint.sh` (root): `firewall.sh` unless `CRA_FIREWALL=off`; `chown -R reviewer:reviewer /home/reviewer` only when the uid differs on the volume root; `exec gosu reviewer /opt/code-review-ai/scripts/supervisor.sh`.

`firewall.sh`: flush OUTPUT; allow lo, established, DNS (udp/tcp 53), the host gateway (`getent hosts host.docker.internal`) on 8790 and the ports listed in `CRA_HOST_PORTS` (default `8789,8788`), every IP of the domains in the built-in list plus `/deployment/firewall-allow.txt`, GitHub ranges from `https://api.github.com/meta` (`web`, `api`, `git`, `packages`); default `OUTPUT DROP`; log one summary line. Built-in domains: `api.anthropic.com claude.ai statsig.anthropic.com sentry.io registry.npmjs.org pypi.org files.pythonhosted.org proxy.golang.org sum.golang.org storage.googleapis.com repo.maven.apache.org plugins.gradle.org services.gradle.org go.dev dl.google.com`.

`supervisor.sh` (reviewer): `tmux new-session -d -s coordinator /opt/code-review-ai/scripts/window-loop.sh`, then `while tmux has-session -t coordinator; do sleep 5; done`.

`window-loop.sh`: forever: `claude update || true`; `claude plugin marketplace add /opt/agent-link >/dev/null 2>&1 || true; claude plugin install agent-link@agent-link --scope user >/dev/null 2>&1 || true`; if `~/.cra-booted` exists `claude --continue --channels plugin:agent-link@agent-link --dangerously-skip-permissions "/boot"` else the same without `--continue` and `touch ~/.cra-booted`; `sleep 3`.

### Task 4: Smoke test and docs

`tests/smoke/compose-smoke.sh`: builds the image, `cra init` into a temp deployment with the fixture company, starts the container with `CRA_FIREWALL=off` and no login, runs `docker compose exec reviewer cra status` and a `cra run prepare` against the bash fixtures copied into the deployment (gh shim on PATH inside), asserts prompts were produced, tears down. Login-dependent steps (register on the hub, a real review) are a manual checklist in `docs/deployment.md`.

`docs/deployment.md`: prerequisites (Docker, a GitHub bot account and PAT scopes, the hub bound to the bridge: `AGENT_LINK_HOST=0.0.0.0` or the bridge IP, issue tracker and documentation index likewise), `cra init …`, fill `.env`, `docker compose up -d`, first login (`docker compose exec reviewer claude` → `/login`, then exit), attach (`docker compose exec reviewer tmux attach -t coordinator`), operations (logs, `cra status`, update, restart), security notes.
