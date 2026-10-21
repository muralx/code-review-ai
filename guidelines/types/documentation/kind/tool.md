### Tool specifics for documentation

A tool's documentation is read at the shell: `--help` is the reference, the README is the
tutorial, and a pipeline author copies both into scripts that will run unattended.

### Always check (tool)

1. The README usage disagrees with `--help`: a flag, subcommand or default present in one and
   absent or different in the other, or `--help` states a default the code does not apply.
   **Major** when a documented flag does not exist or a default differs; **Minor** otherwise.
   Run `--help` for every command and diff against the README; grep the flag definitions.
2. A fenced shell block in the README or docs does not run as written: wrong flag, missing
   prerequisite, output or exit code different from the text. **Major** for the quick start;
   **Minor** elsewhere. Run each block in a scratch directory and compare.
3. Exit codes are undocumented, or the documented list names codes the code never returns.
   **Major** when pipelines branch on them. Grep exit sites; compare with the list.
4. Environment variables, config file keys and their precedence are undocumented or documented
   in the wrong order. **Major**. Grep environment and config reads; compare key by key.
5. A destructive command's documentation and `--help` do not say it is destructive, or omit
   `--dry-run` and `--yes`. **Major**. Read the help text of each command that deletes,
   overwrites or pushes.
6. Network, telemetry, update-check and credential-storage behaviour is undocumented. **Major**:
   an operator cannot judge what the tool sends or keeps. Run with the network blocked; list the
   attempts; find each in the docs.
7. The machine-readable output (`--json`, a report file) has no documented shape, or the
   documented shape is stale. **Major** when a pipeline consumes it. Run the command and diff
   the keys against the document.
8. Install instructions do not yield the command: the package name, binary name or install path
   differ, a prerequisite is missing, the version shown is not published. **Major**. Run them in
   a scratch environment and invoke the result.
9. Generated help, man pages or shell completions are stale against the command definitions.
   **Minor**. Regenerate into a scratch directory and diff.

### False positives (tool)

- README usage generated from the same command definitions as `--help` by the tree's doc
  tooling; regenerate rather than file.
- Flags marked hidden or experimental in code and deliberately absent from `--help`.
- Examples needing credentials or a network the review environment lacks: `verified: false`
  with the command named.
