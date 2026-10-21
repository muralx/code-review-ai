# Company guideline repository (starter)

Copy this directory to the root of a new repository and edit in place. A code-review-ai
deployment reads this repository as its **company** root: the prompt template decides what each
specialist reads, and the framework's default template includes this repository's files right
after the framework's own. See the framework's `docs/guideline-authoring.md` for the template
language and the manifests.

## Directories

| Path | Purpose |
|---|---|
| `defaults.yaml` | the manifest applied to any repository that has no project entry |
| `projects/<name>/manifest.yaml` | one per repository: kind, languages, types, posting, siblings, prompt |
| `projects/<name>/common.md` | project note every specialist of that project receives |
| `projects/<name>/<type>.md` | project note for one review type (`security.md`, ...) |
| `prompts/specialist.md` | a copy of the framework's default template; edit it and set `prompt:` to use it |
| `agents/types/<type>.md` | additions to a specialist's identity |
| `guidelines/common/<NN>-<name>.md` | company-wide policy for every specialist, in filename order |
| `guidelines/types/<type>/general.md` | company additions to a type's general checklist |
| `guidelines/types/<type>/kind/<kind>.md` | additions for one kind (`service`, `library`, ...) |
| `guidelines/types/<type>/lang/<lang>.md` | company additions for `go`, `python`, `ts` or `java` |
| `guidelines/packs/<pack>/<type>.md` | company additions to an opt-in pack, read by the framework's `prompts/<template>.md` that includes that pack |

Only `defaults.yaml` and `projects/` have a fixed meaning. The other paths are what the default
template includes; a company template may include any file under this repository, under any
name, with a line such as `${company}/policies/secrets.md`. Use `###` and lower headings in
guideline files; the template owns `#` and `##`. Every example in this starter is a placeholder
(`your-org`, `example-service`); replace them.

## Adding to the framework versus replacing it

- **Add**: create a file at a path the default template looks for. `guidelines/types/
  coding-practices/lang/go.md` here is read right after the framework's Go list.
- **Replace**: edit `prompts/specialist.md`, delete the framework line you do not want (for
  example `${framework}/guidelines/types/${type}/lang/${lang}.md?`), and set
  `prompt: ${company}/prompts/specialist.md` in `defaults.yaml`, or per type under `types:`.
- A guideline file may include another with a line such as
  `${company}/guidelines/shared/test-db.md`; a reviewed repository's `.code-review/*.md` may do
  the same, which is how a repository reuses company material without copying it.

## Pointing a deployment at this repository

`cra init --company <git url or local path>` clones (or, with `--link`, symlinks) this
repository into the deployment directory as `company/` and records it in `config.yaml`:

```yaml
company:
  repo: git@github.com:your-org/review-guidelines.git
  ref: main
```

The coordinator pulls the clone on every poll tick (or point `--company --link` at a local
checkout you keep current). The next run composes from whatever that directory contains.

## Adding a project

1. Create `projects/<name>/manifest.yaml` with at least `repo:` and `kind:`; copy
   `projects/example-service/manifest.yaml` and edit it.
2. Add `projects/<name>/common.md` for what every specialist should know about the repository,
   and `projects/<name>/<type>.md` for notes that belong to one review type only.
3. Add the repository to `github.repos` in the deployment's `config.yaml` so it is polled.
4. Types marked `required: true` in `defaults.yaml` always run, whatever the project lists.

## Testing what a specialist will see

From a framework checkout, with this repository at `../review-guidelines`:

```sh
bin/resolve-run --request request.json --config config.yaml --framework . \
  --company ../review-guidelines --files files.json --out plan.json
bin/compose-prompt --type security --kind service --lang go --framework . \
  --company ../review-guidelines --project ../review-guidelines/projects/example-service \
  --task task.json --out prompts/security.md --resolution resolution.json
```

`plan.json` shows which project matched, which types run with which model and template, and
whether posting is allowed. `prompts/security.md` is the exact prompt the specialist receives;
each included file is preceded by a provenance line such as
`*${company}/guidelines/common/15-company-policy.md*`. `resolution.json` lists every include
considered, whether it was used and why not. Run `pnpm test` in the framework checkout to
confirm the composer still parses every file.
