### Service specifics for system-design

A service runs as replicas behind a router, restarts without notice, and is upgraded while the
previous release still serves; every check below assumes that lifecycle.

### Always check (service)

1. The readiness probe reports ready before the dependencies the request path needs are
   reachable, stays healthy while one is down with no degrade, or is absent for a new listener.
   **Major**. Start the service with a dependency unreachable and call the probe.
2. Shutdown drops in-flight work: no listener drain, a worker loop ignoring cancellation, a
   consumer acknowledging before finishing, a drain timeout above the orchestrator's grace period.
   **Major**; **Critical** for a dropped write or acknowledged message. Trace the signal to every
   goroutine, task or consumer; name the one it misses.
3. A migration runs in the startup path of every replica, or as a deploy step with no lock, so
   replicas race it or a slow migration blocks readiness. **Major**; **Critical** when it is not
   idempotent. Find where the runner is invoked and whether the tool takes an advisory lock.
4. A dependency client bypasses the tree's shared timeout, retry and circuit-breaker settings (a
   bare constructor beside a configured factory), or the inbound deadline is not propagated to
   outbound calls. **Major**. Compare with the factory; trace the request context outward.
5. A secret or environment-specific value is baked into the image or read at build time rather
   than at runtime from the platform's secret store. **Critical** for a secret; **Major** for a
   hostname or default. Read the container build file; a build argument or embed is evidence.
6. The deploy cannot be rolled back one release: the new release writes a format or column the
   previous one rejects, consumes a queue it does not drain, or flips a behaviour with no off
   path. **Major**; **Critical** when rollback strands data. Write the rollback; name the step
   that fails. Also **Major**: a new background loop with no lag metric can stop silently.

### False positives (service)

- A readiness probe that deliberately excludes an optional dependency, where the request path
  degrades without it, is the right design; confirm the degrade before filing.
- A migration run by a dedicated locked job named in the deploy manifest is not a startup-path
  migration even when the same binary contains the runner.
- Config read once at startup is the convention, not a reload gap, unless siblings hot-reload.
