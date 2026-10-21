### TypeScript specifics for performance (also applies to JavaScript projects)

One thread serves every request, so anything that holds it holds everyone; latency hides in
awaits run in sequence; and V8 rewards monomorphic code and punishes shape changes in hot
functions. Browser bundle size and rendering cost belong to the website kind amendment.

### Always check (typescript)

1. The event loop is held on a server or worker path: `JSON.parse` or `JSON.stringify` on a
   multi-megabyte body, a CPU-bound loop over a user-sized input, synchronous hashing or key
   derivation per request, a heavy regex on untrusted text. **Major**. Measure with
   `perf_hooks.monitorEventLoopDelay()` or `node --cpu-prof` under representative load and cite
   the p99 loop delay; a `*Sync` call on a request path as such belongs to **coding-practices**.
2. Independent awaits run in sequence: `for (const x of xs) await fetch(x)`, or chained awaits
   on unrelated calls, so latency is `n` round trips instead of one. **Major** on a request
   path. Count awaits per element; time the path at `n=1` and `n=20` and cite the ratio.
3. Fan-out whose width is `n` with nothing between it and the pool:
   `Promise.all(xs.map(async ...))` over a user-sized list saturating the database or HTTP
   pool. **Major**. Compare the pool or agent's `maxSockets` with `n`; count in-flight calls
   with a counter in a test. The bound itself belongs to **system-design**.
4. Allocation per element in a hot loop: a `map`, `filter`, `reduce` chain creating
   intermediate arrays over a large input, a spread copy (`{...acc}`, `[...acc]`) inside a
   `reduce` making the accumulation quadratic, a closure created per element. **Minor**;
   **Major** for the quadratic spread. Run `node --cpu-prof` or `--heap-prof` and cite the
   function's self time or allocation share.
5. A hot function de-optimised: objects of varying shape through one property access, `delete`
   on hot objects, holey arrays, mixed number representations, `arguments` use. **Minor**, and
   only with evidence: run `node --trace-deopt` or `--cpu-prof` on the path and cite the deopt
   or the function's share.
6. A whole stream buffered before processing: a request body, upload or response collected
   with `Buffer.concat` or `await text()` where a `pipeline` would pass it through, or a file
   read whole to write it elsewhere. **Major** for user-sized bodies. Read the framework's
   body-size limit; above a few megabytes with no limit, the buffer is the finding.
7. The project's benchmarks or load scripts were not run, or no profile supports the change's
   claim. **Major** on your own output when not run. Run the tree's bench task (`vitest bench`,
   a `benchmark.js` suite) or load script (`autocannon`, `k6`) when present, otherwise
   `node --cpu-prof` on a representative input; cite the numbers or set `verified: false`.

### Idioms a reviewer should expect

- `Promise.all` behind a concurrency limiter for I/O fan-out; a batch endpoint over per-item calls.
- Streams and `pipeline` for bodies and files of unknown size.
- A shared keep-alive agent or client per downstream, created once.
- Worker threads for CPU-bound work; yielding with `setImmediate` in long loops.
- Regexes, validators and schemas compiled at module scope.
- Objects with a fixed shape in hot code: same keys, same order, no `delete`.

### False positives (typescript)

- A synchronous call at startup or in a CLI; the cost is paid once.
- `map` and `filter` chains over tens of elements; the intermediates are noise.
- `Promise.all` over a bounded, small list: a fixed set of services, configuration entries.
- `JSON.parse` of a body already capped by the framework's size limit well under a megabyte.
- A deopt claim from a micro-benchmark that `--cpu-prof` on a realistic input does not reproduce.
