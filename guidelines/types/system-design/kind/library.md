### Library specifics for system-design

A library has no deploy, but it has a version every consumer must move to, a lifecycle it
imposes on each host, and defaults that become every consumer's defaults at once.

### Always check (library)

1. A minor or patch release raises the minimum runtime (`go` directive, `python_requires`,
   `engines`, Java release) or a dependency's floor, so consumers on the old floor cannot take
   the fix. **Major**; **Critical** when the release is a security fix. Diff the manifest floors
   against the version bump.
2. The library starts background work (refresh loop, cache sweeper, pool reaper, timer) with no
   stop the host can call, or a `Close`/`Shutdown` that does not stop it, so every constructed
   instance leaks a thread or goroutine for the host's lifetime. **Major**. Grep `go `,
   `Thread`, `ScheduledExecutor`, `setInterval`, `create_task` in non-test code; name the stop.
3. A default that is harmless in one process is harmful across all consumers: retry without
   jitter or cap, no timeout on an outbound call, an unbounded cache, a per-instance connection
   pool when hosts build many instances. **Major**. Read the defaults; write what a thousand
   hosts do during a one-minute upstream outage.
4. An outbound call the library makes on its own (key set, discovery document, remote config)
   has no cache, backoff or concurrency cap, so every host instance hits the upstream on start
   and again on every error. **Major**. Trace each outbound call to what bounds its rate.
5. A format the library writes for later reading (cache entry, token, state file, serialized
   session) changes with no version marker, so two consumer versions sharing a store disagree.
   **Major**; **Critical** when the new version cannot read old data. Diff the serializer.
6. A background path fails silently: the refresh loop swallows errors and there is no callback,
   metric hook or error channel a host can observe. **Minor**; **Major** when the silent failure
   leaves stale security material in use. Read each loop's error handling.

### False positives (library)

- A floor raised in a major release with the change logged and migration steps named.
- Background work the host starts explicitly (`Start()`, a context-managed run) and the docs
  pair with a stop.
- A library whose documented scope is a single developer tool, not a shared runtime dependency.
