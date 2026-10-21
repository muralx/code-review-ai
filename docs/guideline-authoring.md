# Writing guidelines for code-review-ai

A specialist reviewer never reads a guideline file directly. It reads one composed prompt that
`compose-prompt` builds from a **prompt template** by expanding include lines. This guide
explains the template language, where templates and guidelines live, the manifests that select
them, and how to see exactly what a specialist will get.

## The model in one paragraph

A manifest names a template with `prompt: ${company}/prompts/security.md` (or leaves it unset,
which means the framework's `prompts/specialist.md`). The template is markdown. Every line that
is exactly `${root}/path/to/file.md` is replaced by that file, which may itself contain include
lines. Nothing is implicit: what a specialist reads is what the template includes, in the order
the template lists it.

## Roots

| Root | Directory | Who edits it |
|---|---|---|
| `${framework}` | this repository | framework maintainers: identities, common policy, per-type checklists, language and kind amendments. Never anything company-specific. |
| `${company}` | the company repo a deployment references (`company/` in the deployment) | the company's review owners |
| `${project}` | `projects/<name>/` inside the company repo, when a project matched | the project's maintainers |
| `${repo}` | `.code-review/` inside the reviewed repository; for pull requests read at the merge-base, never from the PR head | the repository's authors |

A root that does not exist in a run (no company configured, no project matched, no
`.code-review/` in the repository) makes every include under it absent.

## Template language

```
${framework}/agents/types/${type}.md           include; an error if the file is missing
${company}/agents/types/${type}.md?            optional include; absent is fine
${framework}/guidelines/common/*.md            every matching file, in name order; never an error
${framework}/guidelines/types/${type}/lang/${lang}.md?   one line per language of the run
${task}                                        the task block generated per run
```

- An include line must be the whole line (leading and trailing spaces allowed). The text
  `see ${company}/style.md` inside a sentence is just text.
- `*` is allowed only in the last path segment.
- `${type}`, `${kind}` and `${languages}` (comma-separated) are substituted anywhere, in
  templates and in included files. `${lang}` repeats the line once per language and is only
  meaningful on include lines.
- Included files may include further files, up to eight levels deep; cycles are errors. This
  is how a repository's `.code-review/testing.md` can pull in
  `${company}/guidelines/shared/test-db.md`, or a company file can reuse another company file.
- An include can only reach files under its own root, symlinks included. A template can come
  from `${framework}`, `${company}` or `${project}`, never from `${repo}`: the reviewed
  repository can add material to the prompt but cannot decide what the prompt is.
- Every included file is preceded by a provenance line, for example
  `*${company}/guidelines/common/15-company-policy.md*`, so the specialist can tell the general
  rule from the specific one. Use `###` and lower headings inside guideline files; the template
  owns `#` and `##`.
- After expansion, a heading with nothing under it before the next heading of the same or a
  higher level is dropped, so a template can list `## Project guidelines` for every run and the
  heading only appears when something was included there.

## Frontmatter

A guideline file may start with a YAML block:

```markdown
---
applies_to: [pr, local]   # any of pr, audit, local; default: all
---
```

`applies_to` keeps a file out of compositions for other target kinds; the framework's re-review
rules apply to `pr` and `local` only. Other keys are ignored.

## The framework template

`prompts/specialist.md` is what a company gets without writing a template of its own:

```
# Review instructions: ${type}

## Identity
${framework}/agents/types/${type}.md
${company}/agents/types/${type}.md?

## Common policy
${framework}/guidelines/common/*.md
${company}/guidelines/common/*.md

## Guidelines for ${type}
${framework}/guidelines/types/${type}/general.md
${framework}/guidelines/types/${type}/kind/${kind}.md?
${framework}/guidelines/types/${type}/lang/${lang}.md?
${company}/guidelines/types/${type}/general.md?
${company}/guidelines/types/${type}/kind/${kind}.md?
${company}/guidelines/types/${type}/lang/${lang}.md?

## Project guidelines
${project}/common.md?
${project}/${type}.md?

## Repository guidelines
${repo}/common.md?
${repo}/${type}.md?

${task}
```

So with no template of its own, a company **adds** to the framework by creating files at the
paths that template names: `agents/types/security.md` appends to the identity,
`guidelines/types/coding-practices/lang/go.md` appends to the framework's Go list, and so on.
To **replace** anything, write a template: copy `prompts/specialist.md` into the company repo,
delete or reorder lines, point `prompt:` at it. Replacing the framework's Go list is one deleted
line. A template is just a file, so a company may keep several (`prompts/strict.md` for
security, `prompts/light.md` for documentation) and pick per type.

Framework layout, for reference:

```
prompts/specialist.md                      the default template
agents/types/<type>.md                     specialist identity
guidelines/common/<NN>-<name>.md           policy every specialist gets, in filename order
guidelines/types/<type>/general.md         the type's language-independent checklist
guidelines/types/<type>/kind/<kind>.md     amendment for service | library | tool | website | contracts | spec
guidelines/types/<type>/lang/<lang>.md     amendment for go | python | ts | java
guidelines/packs/<pack>/<type>.md          opt-in rule sets; no default template includes them
```

Review types: `security`, `testing`, `coding-practices`, `code-structure`, `architecture`,
`system-design`, `documentation` run when no manifest declares types. Two more run only when a
manifest lists them: `spec-compliance` (did the change build what was asked, nothing more, and
is each requirement shown to be met) and `performance` (what a path costs and what was
measured). Kinds: `service`, `library`, `tool`, `website`, `contracts` (a shared wire-contract
module: schemas, codecs, generated stubs consumed by independently deployed services) and
`spec` (a documents-only specification repository). The company repo has no required layout
beyond `defaults.yaml` and `projects/<name>/manifest.yaml`; the paths above are only what the
default template looks for.

## Packs and the ready templates

A pack is a set of rules that depends on a stack or process choice rather than on the kind, so
no default template includes it. `prompts/` ships templates that do:

| Template | Adds to the default |
|---|---|
| `${framework}/prompts/specialist.md` | nothing; the default |
| `${framework}/prompts/light.md` | nothing, and drops kind and language amendments: identity, common policy, general checklist, project and repo files only |
| `${framework}/prompts/hexagonal-service.md` | `packs/hexagonal-service` (ports-and-adapters layering, forbidden patterns, fakes at ports) and `packs/persistence` (migration safety under rolling deploy, tenant scoping, real database in tests) |
| `${framework}/prompts/standards-driven.md` | `packs/standards-driven` (behaviour on spec-defined surfaces cites the standard; conformance tests follow the catalog) |
| `${framework}/prompts/open-source.md` | `packs/open-source-release` (README, LICENSE, examples, no internal references on the export path) and `packs/quality-gates` (formatter, linter, type checker, coverage floor, size thresholds) |
| `${framework}/prompts/full.md` | every pack |

Each template includes the framework pack and then `${company}/guidelines/packs/<pack>/${type}.md?`,
so a company extends a pack by creating that file. To mix packs differently, copy a template
into the company repo and keep the lines you want; a pack is only a directory of files.

## Manifests

`projects/<name>/manifest.yaml`:

```yaml
repo: acme/widgets                 # GitHub name, or a filesystem path prefix for local targets
kind: library                      # service | library | tool | website | contracts | spec
languages: [go, ts]                # omit to infer from the files under review
prompt: ${company}/prompts/specialist.md   # template for every type below that sets none
types:                             # which specialists run, and how
  security:  { required: true, effort: xhigh, prompt: ${company}/prompts/strict.md }
  testing:   { required: true }
  coding-practices: {}
  documentation: { model: claude-sonnet-5-5, effort: medium }
posting: auto                      # auto | comment-only | never
siblings: [acme/widgets-sdk]       # extra read-only clones for cross-repo checks
```

`defaults.yaml` has the same shape minus `repo` and applies to any repo without a project.
`spec-compliance` and `performance` never run unless a manifest lists them.
Precedence: a project's `types` list decides which specialists run; types the company marks
`required: true` in `defaults.yaml` are always added back; per-type `model`, `effort` and
`prompt` from `defaults.yaml` are inherited when a project lists the type without them, and a
manifest-level `prompt` applies to every type that sets none. With no company manifests at all,
every type runs with the framework template.

A target `.code-review/manifest.yaml` may **add** types and languages. It cannot remove a type,
change `required`, `kind`, `posting`, `siblings` or name a `prompt`; such fields are ignored and
listed in `plan.json` under `ignoredTargetFields`.

## See what a specialist will get

```sh
bin/resolve-run --request request.json --config config.yaml --framework . \
  --company /path/to/company --target-guidelines /path/to/repo/.code-review \
  --files files.json --out plan.json

bin/compose-prompt --type security --kind library --lang go --lang ts \
  --template '${company}/prompts/strict.md' \
  --framework . --company /path/to/company --project /path/to/company/projects/widgets \
  --repo /path/to/repo/.code-review --task task.json --out prompts/security.md \
  --resolution resolution.json
```

`plan.json` says which project matched, which types will run with which model and template, and
why posting is or is not allowed. `resolution.json` lists the template and every include it
considered: the reference as written, which file included it, whether it was used and why not
(`absent`, `no-root`, `applies_to`), and a content hash, so a review can be traced to the exact
text the specialist saw. `tests/snapshots/` holds composed prompts for three scenarios (a Go service PR, a Go
hexagonal-service PR and a TypeScript library local review);
`pnpm test` fails when a guideline edit changes them, and `pnpm snapshots:update` accepts the
change.

## Writing good guidelines

- Every check names the failure, a severity floor, and how to verify it. If a reviewer could
  not demonstrate it, it is not a check.
- Add a false-positives list. Precision is what makes autonomous reviews trusted.
- One file, one concern. A company rule about secrets belongs in a security file, not in
  `common.md`.
- Keep the framework neutral. Company names, ticket prefixes, internal hostnames and product
  names go in the company repo. `tests/guidelines-lint.test.ts` fails on any name listed in
  `tests/forbidden-names.local` (gitignored, one regular expression per line), so a maintainer
  can guard against their own names without publishing them.
- Prefer adding files the default template already looks for. Write a template when the
  framework's choice is wrong for you, not merely incomplete.
