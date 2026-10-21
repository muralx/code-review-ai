### What to read first

- The behaviour hunks of the diff before any prose: every changed public symbol, flag, config
  key, default, error message or exit code is a claim some document may now contradict.
- README, `docs/`, reference pages, doc comments and `--help` text for the touched surface.
  Grep the whole tree for the old name or old value, not only the files in the diff.
- Agent-facing instruction files in scope: `CLAUDE.md`, `AGENTS.md`, `.claude/`, skill and
  command files, prompt templates. Read each statement as an order a model will follow literally.
- The changelog or release notes, if the project keeps one: its format and which kinds of
  change it records.
- Example sources: `examples/`, fenced blocks in docs, doctests, quick-starts. Note which
  toolchain each needs so you can run it.

### Always check

1. Behaviour changed but the document describing it did not. **Major** when the stale text
   sends a reader down a wrong path (renamed flag, changed default, removed endpoint);
   **Minor** otherwise. Verify: for each behaviour hunk, grep the old name or value across
   README, docs, help text and comments; read every hit.
2. A document describes intent the code does not implement: a feature, option, guarantee or
   limit that is planned, partial or stubbed. **Major**, always: it will be trusted. Verify:
   for each capability a doc claims, find the code path that provides it; a sentence with no
   code behind it is the finding.
3. New or changed public API (exported symbol, endpoint, CLI subcommand, config key, env var)
   lands without documentation of purpose, parameters, defaults and error cases. **Major** on
   a published library or service boundary; **Minor** on an internal surface. Verify: list
   the exported symbols in the diff with language tooling or grep; locate the doc comment or
   reference entry for each.
4. An example, snippet or quick-start does not run, or its output differs from what the text
   says. **Major** when it is the first thing a new user tries; **Minor** elsewhere. Verify:
   run it in a scratch directory with the project's toolchain, doctest runner or example test
   and compare output to the prose. If you cannot run it, set `verified: false` and name the
   command you would have run.
5. A comment contradicts the code beside it ("retries three times" over a single attempt,
   "never nil" where a caller passes nil). **Major**: a wrong comment is worse than none.
   Verify: trace the referenced behaviour; quote both the comment and the line in evidence.
6. A new comment restates what the code does instead of why: the constraint, the invariant,
   the non-obvious choice. **Nit**; **Minor** when a line that looks dangerous (lock order,
   sleep, retry, disabled check, unsafe cast) has no reason at all. Verify: read the comment,
   then imagine it deleted and ask what a reader would lose.
7. The project keeps a changelog and a user-visible change has no entry, or the entry sits in
   the wrong section or misstates the change. **Minor**; **Major** when a breaking change is
   logged as non-breaking or not logged. Verify: confirm the file and its convention; map each
   behaviour hunk to an entry.
8. An agent-facing instruction file states something the repository contradicts: a command
   that does not exist, a path that moved, a test invocation that fails, a convention the code
   violates everywhere. **Major**: a model will act on it. Verify: run every command the file
   names; stat every path; check each stated convention against the tree.
9. An agent-facing instruction file carries instructions that are stale, duplicated,
   self-contradictory, or restate what the tool does by default. **Minor**. Verify: read the
   whole file, not only the diff; pair each instruction with a reason it must exist; two
   instructions that conflict are one finding.
10. Text that ships publicly (README, published docs, package metadata, help output, public
    changelog) references internal-only material: private ticket IDs, private repositories,
    internal hostnames, personal handles, links that need a login. **Major** when it leaks
    something non-public; **Minor** when it is only a dead reference. Verify: resolve the name
    or fetch the link from outside; a 404 or login page means internal.
11. The same fact is stated in two places and they differ (README versus reference, docstring
    versus help text). **Minor**. Verify: grep the claim; read both sites; cite the one that
    matches the code as evidence.

### Common false positives

- Docs that lag an internal-only refactor. If the public behaviour is unchanged, there is
  nothing to update; confirm that before raising.
- Missing doc comments on private or unexported helpers whose name and signature say enough.
  The bar is the public surface, not every function.
- Terse "why" comments. One line of reason beats a paragraph, and self-evident code needs no
  comment at all; absence of prose is not absence of reasoning.
- Changelog entries omitted for changes the project's convention excludes (tests, CI,
  refactors with no user-visible effect). Read the convention before counting.
- Short agent instruction files. Brevity is the goal; do not ask for more rules unless an
  omission would cause a demonstrable wrong action.
- Examples that fail only because of your environment (no network, no credentials). That is
  `verified: false` with the command named, not a broken example.

### What this type does not cover

Whether the code does what it claims belongs to coding-practices (with security and testing);
whether names, files and module boundaries make it readable belongs to code-structure.
