### What to read first

- Which paths the diff touches are hot: request handlers, message consumers, per-item loops,
  anything run once per element of a user-sized input. Classify each changed function as
  request or ingest path, batch, or startup and cold before judging a line.
- Where `n` comes from for every loop and collection in the diff: a request parameter, a table,
  a file, a fixed list. Who controls it and what bounds it.
- What the project already measures with: benchmark files, load-test scripts, profiler
  configuration, a performance CI job, budgets or thresholds in config. Run what exists on
  the changed path; the language amendment names the tools when the project has none.
- The pools, caches and batching layers the changed code sits behind, so a round trip you
  count is one that happens.
- The description's performance claims, their numbers and their method: input size,
  concurrency, warm or cold, debug or release build.
- In an audit: the hottest entry points by the project's own metrics or, absent those, every
  request handler and consumer; profile one representative workload; group by path.

### Always check

1. Work inside a loop that could be done once or batched: a query per item, an allocation
   per item, a regex or template compiled per call, the same input parsed repeatedly,
   synchronous I/O per element. **Major** on a request or ingest path; **Minor** elsewhere.
   Read the loop body and every call it makes and count operations per input element; for
   queries, count statements in a test at `n=1` and `n=100` with the driver's query log or a
   counting double, and cite both numbers.
2. Quadratic or worse work on an input a user controls: nested loops over one collection,
   membership tests on a list inside a loop, a sort repeated per element, a string or array
   rebuilt by copying on every iteration. **Major**; **Minor** when `n` is bounded by
   configuration to a small constant. Name `n` and its source; time the path at two input
   sizes a factor of ten apart and cite the ratio.
3. An unbounded result set is loaded and held: a query with no limit, a whole table or file
   read into a buffer, a stream collected into a list before processing, a response built
   from everything matched. **Major**. Trace the read to the structure that holds its result
   and name the limit, page or stream boundary; its absence is the evidence. Accepting
   unbounded work at the boundary belongs to **system-design**; holding it in memory is yours.
4. A cache is added or changed with no invalidation story, a key with unbounded cardinality
   (user id, free text, a path with ids, a timestamp), or no size bound and no TTL.
   **Major**. Read the key construction, the eviction setting and every writer to the cached
   source; name what makes an entry stale and what bounds the entry count.
5. A new synchronous blocking call on a latency-sensitive path: a disk flush, a remote call,
   a DNS lookup, a lock held across I/O, a blocking call on an event loop or async executor.
   **Major**. Trace the handler to the call; when a harness exists, measure the handler's
   p50 and p95 with the call real and with it stubbed; otherwise cite the call and the lock
   scope.
6. The project's benchmark, load test or profiling job was not run on the change, or shows a
   regression the change does not address. **Major** on your own output when you did not run
   it; **Major** for an unaddressed regression. Run it on base and head with the same input;
   cite the command and both results; when it cannot run, set `verified: false` and name the
   command you would have run.
7. The description claims a performance effect with no numbers ("faster", "reduces load",
   "optimised"). **Minor**; ask for the measurement: what was measured, input size,
   concurrency, before and after. A measurement that is not representative (warm cache,
   tiny input, one thread, debug build) is also **Minor**; name the missing condition.
8. A performance guard is removed, disabled or loosened: a limit, timeout, budget, pool size,
   batch size, rate limit, default page size, maximum body size. **Major**; **Critical** when
   the guard protected against a failure the tree's history or comments record. Diff config
   and constants; a removed guard needs a stated reason and a measurement showing the
   guarded case no longer occurs.
9. Serialization, logging, string building or reflection on a hot path: a whole entity
   encoded to log it, an encode-decode round trip used as a deep copy, a log line per
   element, a message formatted before the level check, a reflective lookup per call that a
   cached accessor would replace. **Minor**; **Major** when the profile shows it dominating
   the path. Count per element; profile and cite the fraction.
10. Memory proportional to the input is retained past its use: a list accumulated to return
    a count, references kept in a long-lived map, buffers never released, a per-request
    structure attached to a process-lifetime object. **Major** in a long-running process.
    Trace the lifetime of each new collection; run the allocation profiler and cite retained
    size at two input sizes.
11. A client, connection, thread or worker is created per call where the tree has a shared
    instance or pool: an HTTP client per request, a database connection per query, a thread
    per item. **Major**. Grep the diff for client and connection constructors inside
    functions invoked per request or per item; compare with how a sibling path obtains its
    client.

### Common false positives

- A micro-optimisation in a cold path: startup, configuration loading, an admin command, a
  test helper. Count invocations per second first; below one, file nothing.
- A request to memoize or cache where nothing shows the repeat is paid for; "could be cached"
  is not a finding without a count or a profile.
- A cost an existing pool, request-scoped cache, dataloader or batch layer already absorbs.
  Trace the call to that layer before counting it as a round trip.
- Work done once at startup: a regex compiled at module load, a table built in an
  initializer, reflection in a constructor called once.
- Code the compiler or runtime demonstrably optimises: an allocation kept on the stack, a
  loop invariant hoisted, a tiny call inlined. Demonstrate with the language's tooling first.
- Readability traded for an unmeasured win: do not ask for a hand-rolled loop in place of a
  clear comprehension, stream or map chain unless a profile shows the chain.
- Quadratic work over a collection bounded by a constant in the code: enum members, a fixed
  configuration list, the columns of a known table.

### What this type does not cover

Capacity planning, backpressure and bounds on accepted work, timeouts and retries,
consistency and rollback belong to **system-design**; whether the code is correct to
**coding-practices**; a cost an attacker can trigger to **security**.
