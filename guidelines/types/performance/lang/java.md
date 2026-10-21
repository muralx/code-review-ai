### Java specifics for performance

The JIT makes most straightforward code fast, so the cost that remains hides where it cannot
help: allocation rate feeding the collector, boxing, locks held under contention, blocking I/O
on shared pools, and a database called once per row. Measuring needs warm-up, so a number
without a harness is not a number.

### Always check (java)

1. Boxing on a hot path: `List<Integer>` or `Map<Long, ...>` in a tight loop, arithmetic on
   wrapper types, a primitive key boxed per `HashMap.get`, a `Stream<Integer>` where `IntStream`
   exists. **Minor**; **Major** with an allocation profile. Run JMH with `-prof gc` and cite
   `gc.alloc.rate.norm`, or async-profiler in allocation mode.
2. A stream pipeline in the innermost loop of a hot path over a handful of elements, or
   `parallelStream()` over small or blocking work so it saturates the shared common pool.
   **Minor**; **Major** for `parallelStream()` around I/O. Benchmark loop against stream with
   JMH; for the pool, take a thread dump under load and cite the blocked common-pool workers.
3. String building in a loop: `+=` on a `String`, `String.format` per element, a log call whose
   arguments are concatenated before the level check. **Minor**; **Major** with a profile. Read
   the loop; look for parameterised logging (`{}` placeholders) or a level guard.
4. Lock contention on a hot path: `synchronized` on a method called per request, one lock
   around I/O, `computeIfAbsent` with a blocking mapping function, a lock taken on every read
   of a value initialised once. **Major** under concurrency; **Minor** for the read-side lock.
   Record with JFR (`-XX:StartFlightRecording`) or async-profiler `-e lock` and cite the
   monitor-blocked events; load-test at one thread and at thirty-two and cite the ratio. The
   race in a broken double-checked lock belongs to **coding-practices**.
5. Allocation rate from per-request temporaries: `byte[]` copies (`toByteArray`,
   `Arrays.copyOf` in loops), large collections rebuilt per call, lambdas and `Optional` in
   the innermost loop. **Major** when GC time or pause frequency rises under load. Run with
   `-Xlog:gc` under the load test and cite collections per minute before and after.
6. One statement per row on an ingest or request path: `executeUpdate` per row with no
   `addBatch` and `executeBatch`, an ORM flushing one entity at a time with no batch size
   configured, or a lazy association touched per element with no fetch join or entity graph.
   **Major**. Enable the driver SQL log or a statement-counting proxy; cite statements at
   `n=1` and `n=100`.
7. The project's JMH benchmarks were not run, or a micro-benchmark in the description comes
   from `System.nanoTime` around a loop in `main` with no warm-up or forks. **Major** on your
   own output when not run; **Minor** for the unreliable method. Run the tree's JMH task on
   base and head with the same forks and iterations; cite score and error, or set
   `verified: false`.

### Idioms a reviewer should expect

- Primitive arrays and `IntStream`/`LongStream` on hot numeric paths; `StringBuilder` with a
  capacity hint; parameterised logging.
- JDBC batching or the ORM's batch size for bulk writes; fetch joins or entity graphs where the
  access pattern is known; pagination for reads.
- `LongAdder` and concurrent collections over `synchronized` counters; lock scope excluding I/O.
- Serializers, `Pattern` and `DateTimeFormatter` built once and shared; a dedicated executor
  for blocking I/O, never the common pool.
- JMH with warm-up, forks and `Blackhole` behind any claimed micro-win.

### False positives (java)

- A stream on a path run a few times per request; only a profile says otherwise.
- Boxing in configuration, startup or test code.
- A `synchronized` block held for nanoseconds with no I/O and no measured contention.
- `+` concatenation in one expression; the compiler emits a single builder or concat call.
- An allocation that escape analysis scalar-replaces; a JMH `-prof gc` rate near zero settles it.
