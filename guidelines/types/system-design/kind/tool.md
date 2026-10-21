### Tool specifics for system-design

A tool is run by people and pipelines that retry it, interrupt it, run two copies at once and
upgrade it independently of the things it operates on; its deploy is every installation.

### Always check (tool)

1. A run interrupted or failed halfway cannot be re-run cleanly: partial outputs are taken as
   complete, a lock is left behind with no stale detection, remote resources were created and
   not recorded so the retry duplicates them. **Major**; **Critical** when the duplicate is a
   remote resource, a payment or a published artifact. Kill a run mid-way, re-run, diff.
2. Two concurrent runs on the same target corrupt its state: no lock, a lock the second run
   ignores, or a shared cache written without atomic replace. **Major**. Start two runs together
   on one scratch target and compare with a single run.
3. Self-update or an update check runs on every invocation, replaces the binary in place rather
   than by atomic rename, or offers no way to pin a version, so pipelines break on a release the
   tool chose. **Major**. Read the update path; run with the network blocked and time it.
4. The build is not reproducible or identifiable: no `--version`, a version string hard-coded
   rather than injected at build, build time or absolute paths embedded so two builds of one
   commit differ. **Minor**; **Major** when pipelines pin by version or a bug report cannot name
   the build. Build twice and compare checksums; run `--version`.
5. A config file, state file or cache format changes with no version marker, so an upgraded tool
   rejects or misreads what the previous release wrote, or a downgrade cannot read the new one.
   **Major**. Run the new build against a fixture written by the previous release.
6. The tool assumes one version of what it operates on (repository layout, API, schema, target
   runtime) and does the wrong thing silently on another. **Major** for silent wrong results;
   **Minor** for an unclear failure. Run against the oldest target the documentation supports.
7. Shared remote resources are hit with no rate limit, backoff or concurrency cap: an API call
   per item, retries without jitter, so one run exhausts a quota shared by every user of the
   token. **Major**. Count requests for a ten-item and a thousand-item input.
8. A failure in a pipeline cannot be diagnosed from the output: no `--verbose`, errors that omit
   the file, item or step, no structured log option. **Minor**; **Major** when a common failure
   prints only a generic message. Run a failing case and read what it prints.

### False positives (tool)

- A tool documented as single-user and local-only; concurrency and quota checks need a stated
  shared use.
- Version pinning provided by the package manager and its lockfile rather than by the tool.
- A build stamp the tree deliberately embeds and documents as the one non-reproducible field.
