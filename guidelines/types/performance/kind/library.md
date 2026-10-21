### Library specifics for performance

A library's cost is paid on every consumer's hot path and cannot be tuned from outside: an
allocation per call, a lock around a shared object or a fetch in a constructor is multiplied by
every host, under concurrency the author never ran.

### Always check (library)

1. An exported function on a per-request path allocates what the caller cannot reuse: a
   buffer, encoder, regular expression or client built per call with no streaming or reusable
   variant (a reader/writer form, a pooled instance, a precompiled pattern). **Major** on a
   documented hot path; **Minor** otherwise. Run the benchmark with allocation reporting
   (`go test -bench -benchmem`, a profiler) and cite allocations per operation.
2. A constructor, static initializer or module import does hidden I/O or blocks: network fetch,
   DNS, file read, remote config, a synchronous warm-up. **Major**: the host cannot schedule,
   cancel or retry it, and the latency joins every consumer's startup. Read constructors in
   the diff; run a construction with the network blocked; `python -X importtime` or a trace
   where it applies.
3. A process-wide cache is keyed by caller data with no size cap, TTL or eviction, or the cap
   exists and the host cannot set it. **Major**: memory grows with the consumer's inputs. Grep
   package-level maps and dictionaries written on the call path; find the eviction.
4. One lock serialises a hot operation across all host threads (a mutex around a cache lookup,
   a counter, a shared client), or a lock is held across I/O. **Major**. Run the benchmark in
   parallel (`-cpu`, parallel test runners) and compare with the serial number; read what the
   critical section contains.
5. A change on a hot path has no benchmark, or an existing benchmark moved and the change does
   not say so. **Minor**; **Major** when the path is documented as performance-sensitive. Run
   the benchmark before and after (`benchstat`, `pytest-benchmark`, JMH, the tree's harness)
   and cite the numbers.
6. Cost grows faster than the caller's input: a nested loop over a caller-supplied collection,
   repeated linear search, a regular expression that backtracks on crafted strings. **Major**.
   Time the operation at one and ten times the input size.
7. Importing the library is expensive for every consumer: a heavy transitive dependency loaded
   at import, large static tables built eagerly, a bundle size jump. **Minor**; **Major** when
   the cost serves an optional feature. Measure import time or bundle size before and after.

### False positives (library)

- Allocation or I/O in a one-time setup path the host calls once, documented as such.
- A cache bounded by the set of distinct configurations, not by the set of inputs.
- A benchmark delta within run-to-run noise; cite repeated runs or the statistic, not one run.
- A lock around a once-only initialisation (`sync.Once`, a lazy static) off the hot path.
