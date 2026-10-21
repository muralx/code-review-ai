### Quality-gates specifics for coding-practices

This pack opts the review into tool-enforced gates: the tree's formatter, linter and type
checker run on the change and their results are part of the findings, superseding the common
rule that tools run only to verify a specific finding. The tools are the tree's own; the
table below lists typical examples, not requirements.

### Always check (quality-gates)

1. The tree's formatter, linter or type checker reports on the changed files. A formatting
   difference is **Nit**; a lint error **Minor**, **Major** when the rule that fired names a
   real defect (unused result, possible nil dereference, shadowed variable, unreachable code);
   a type error **Major**. Run each tool as the tree's config or CI invokes it, restricted to
   the changed files where the tool allows; cite the command and the count. When the tree has
   no such tool, say so once and file nothing.
2. The diff adds a suppression (`# type: ignore`, `# noqa`, `@ts-ignore`, `@ts-expect-error`,
   `eslint-disable`, `//nolint`, `@SuppressWarnings` and the like) that hides a real
   diagnostic, or is unscoped (no rule name) or unexplained. **Major** when the suppressed
   diagnostic is a defect; **Minor** when it is unscoped or has no reason. Remove the
   suppression in a temporary copy, run the tool, and read what it reports.
3. Lint, type-check or compiler-warning configuration is loosened in the diff: a rule
   disabled, strictness lowered, a path excluded, a warning demoted. **Major**. Diff the
   config files and cite the rule.
4. The count of warnings or diagnostics on the touched files is higher after the change than
   before. **Minor**. Run the tool on the merge base and on the head for the same files; cite
   both counts.
5. Compiler warnings in languages that have them (`javac -Xlint`, `go vet`, `tsc` under the
   tree's strictness) appear on changed files. **Minor**; **Major** when the warning names a
   defect. Build and cite.

### Typical tools (examples; the tree's configuration decides)

| Language | Format | Lint | Types |
|---|---|---|---|
| go | `gofmt`, `goimports` | `go vet`, `golangci-lint`, `staticcheck` | the compiler |
| python | `ruff format`, `black` | `ruff check`, `flake8`, `pylint` | `mypy`, `pyright` |
| ts | `prettier`, `biome format` | `eslint`, `biome check` | `tsc --noEmit` |
| java | `spotless`, `google-java-format` | `checkstyle`, `error-prone`, `pmd` | `javac -Xlint:all` |

### False positives (quality-gates)

- Formatting or lint output on lines the diff did not touch; that is pre-existing and goes in
  one `follow-up` line at most.
- A suppression scoped to one rule with a reason that holds when you read the code.
- Generated or vendored files the tool's own configuration excludes.
- A tool the tree does not configure: do not ask for its adoption in a review.
