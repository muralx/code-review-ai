# code-review-ai

A framework for autonomous code-review agents built on Claude Code. A company deploys it once,
as one container. The agent:

- reviews pull requests where its bot account is requested, and re-reviews them when it is
  requested again;
- audits a repository or part of one at a given ref;
- reviews a local working tree before anything is pushed, without publishing;
- takes requests from other agents and from people over
  [agent-link](https://github.com/muralx/agent-link), and answers questions about its findings.

Each review runs one specialist per review type in parallel (security, testing, coding
practices, code structure, architecture, system design, documentation, and opt-in spec
compliance and performance). A merger then combines their findings into one review. For a pull
request, the verdict is computed from the findings by a fixed rule and posted as the bot.

What a specialist is told comes from guideline files in four places: this framework, a
company guideline repository, a project inside it, and the reviewed repository itself. A
deterministic resolver composes them, with no model deciding which rules apply. The framework
holds only general material; anything company- or project-specific lives in the company's
repository.

## Documentation

| Read | For |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | How it works: roles, tools, the life of a run, the container |
| [`docs/deployment.md`](docs/deployment.md) | Setting up and operating a deployment for a company |
| [`docs/guideline-authoring.md`](docs/guideline-authoring.md) | Prompt templates, guideline files and manifests; seeing exactly what a specialist gets |
| [`docs/request-protocol.md`](docs/request-protocol.md) | Asking for a review over agent-link |
| [`docs/runs-and-tools.md`](docs/runs-and-tools.md) | The run directory and every command-line tool |
| [`templates/company/README.md`](templates/company/README.md) | The starter company guideline repository |
| [`docs/history/`](docs/history/README.md) | The original design, implementation plans and research, kept as written |

## Quick start

```sh
pnpm install
docker build -f docker/Dockerfile -t code-review-ai:latest .
bin/cra init --dir ~/reviews/acme --company ./templates/company --workspace acme-dev \
  --identity acme-review-bot --local-root ~/dev
```

Then follow [`docs/deployment.md`](docs/deployment.md): set the repositories to poll in
`config.yaml` and the bot's token in `.env`, start the container, and log Claude Code in once.

## Repository layout

```
agents/      coordinator, specialist and merger definitions, review-type identities, commands
prompts/     prompt templates (default, light, full, and pack templates)
guidelines/  common policy, per-type checklists with kind and language amendments, opt-in packs
templates/   starter company guideline repository
src/         TypeScript CLIs and their unit tests (Node 24, run directly, no build step)
bin/         entry points: cra, resolve-run, compose-prompt, discover, post-review
scripts/     container runtime and git plumbing (bash)
docker/      Dockerfile and the templates `cra init` renders
tests/       fixtures, bats suites, prompt snapshots, compose smoke test
docs/        current documentation; docs/history/ for point-in-time records
```

## Develop

Requires Node 24, pnpm and bats.

```sh
pnpm install
pnpm test               # unit tests (node --test) and bats suites; GitHub is never contacted
pnpm typecheck          # tsc --noEmit
pnpm snapshots:update   # accept a change to the composed-prompt snapshots
tests/smoke/compose-smoke.sh   # builds the image, starts a deployment, runs the deterministic pipeline (needs Docker)
```

A guideline edit changes the prompt snapshots under `tests/snapshots/`, so the diff shows
exactly what each specialist will read differently. `tests/guidelines-lint.test.ts` fails if
company-specific names enter the framework's guidelines.

## License

Apache License 2.0; see [`LICENSE`](LICENSE).
