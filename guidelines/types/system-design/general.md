### What to read first

- How this unit deploys: manifests, health checks, replica count, migration hook, whether old
  and new versions serve at once. When nothing says otherwise, assume a rolling deploy with
  overlap and a rollback to the previous release.
- Every wire boundary the change touches: API and message schemas, database schemas and
  migrations, cache key and value formats, file formats, event names.
- The call graph outward from new code (every network call, queue publish, store write) and
  inward (who calls this path, with what deadline, and who retries it).
- The tree's existing observability conventions: log structure, metric naming, trace
  propagation helpers. The gap in the new path is measured against a sibling path.
- In an audit: the list of external dependencies, the migration directory in order, and the
  client constructors for every outbound call. Findings are `pre-existing`; group identical
  gaps into one finding with a count.

### Always check

1. A wire or schema change is not backward compatible: a required field added, a field
   removed or renumbered, an enum value removed, a response shape old clients still parse
   changed. **Critical** on a public or multi-team surface; **Major** inside one deployment.
   Diff the schema file; run the project's breaking-change check if it has one; otherwise
   read the oldest consumer still deployed.
2. A migration cannot run while the previous release still serves: dropping or renaming a
   column that release reads, adding a non-null column without a default, rewriting a large
   table under one lock. **Critical** when old code errors; **Major** when it locks or
   backfills in the request path. Map each statement to what the previous release reads and
   writes; check the engine's lock behaviour for that statement, in docs or by running it.
3. A retried operation is not idempotent: a create with no idempotency key, a consumer with
   no dedupe, a retry loop around a multi-write with no transaction or outbox. **Major**;
   **Critical** when the duplicate is money, a notification sent twice, or data. Name who
   retries (client, library default, queue redelivery) and what the second execution does;
   run the handler twice in a test when one exists.
4. An outbound call has no timeout, a timeout longer than its caller's deadline, or retries
   without a cap, backoff and jitter. **Major**. Read the client constructor and the
   library's actual default in its source, not from recall; compare with the inbound deadline.
5. A new path accepts unbounded work: no queue bound, no concurrency limit, no pagination, no
   maximum body or batch size, fan-out with no cap. **Major**. Trace the input size to the
   loop or allocation it drives and state what, if anything, stops it.
6. The code assumes a consistency the store does not give: read-after-write on a replica, a
   cache treated as source of truth, two stores updated without a transaction or outbox,
   ordering assumed across partitions or workers. **Major**; **Critical** when the result is
   wrong data a user or a ledger sees. Name the store and its documented guarantee, then the
   two operations that can interleave.
7. A slow or absent dependency takes an unrelated path down: no degrade for a non-essential
   call, one shared pool exhausted by one callee, startup hard-failing on an optional
   service, one tenant's errors stalling others. **Major**. For each new dependency, write
   what happens when it is slow rather than down: what blocks, what fills, and who notices.
8. A new path is invisible at 3 a.m.: no error log with a correlation id, no rate, error or
   latency metric, trace context not propagated across the new hop, or a per-item log in a
   hot loop. **Major** for a missing failure signal; **Minor** for a missing latency metric.
   Grep the new path for the tree's logging, metric and trace helpers and compare with a
   sibling path that has them.
9. A hot path gained cost: an extra round trip per request, a query inside a loop, a lock or
   a synchronous flush on the request path, a dropped cache, serialization of a large object.
   **Major** on a request or ingest path; **Minor** elsewhere. Count round trips before and
   after; run the benchmark or an explain plan when the project has one.
10. The change cannot be rolled back: an irreversible migration, a new message or state
    format the previous release rejects (so rolling back the producer strands data), a
    behaviour switch with no flag. **Major**; **Critical** when rollback loses data. Write
    the rollback sequence step by step; the step that fails is the evidence.
11. Capacity changes with no number attached: a new per-request fan-out, a new table with no
    retention, a new queue with no consumer scaling, a cache with no eviction. **Minor**;
    **Major** when growth is proportional to user input. State the multiplier and what it
    multiplies; read the retention or eviction setting rather than assuming one.

### Common false positives

- A client whose wrapper or constructor already sets a timeout or retry policy upstream of
  the call site. Read the constructor chain before filing.
- An expand-only migration (nullable column, new table, new index built online) is safe under
  rolling deploy; the hazard is the later contract step, reviewed when it arrives.
- Idempotency provided by the store, such as a unique constraint, an upsert or a conditional
  write, rather than by visible code. Confirm the constraint exists, then drop the finding.
- A single-replica internal batch job or an offline tool does not need request-path
  observability or backpressure; Minor at most, and only with a scenario.
- Stale reads the product tolerates and the code acknowledges (a listing page, a counter) are
  a design choice, not a consistency defect.
- A hot-path cost that an existing cache, batch or connection pool already absorbs. Trace the
  call to the pool before counting it as a round trip.

### What this type does not cover

In-process layering, abstraction cost and in-process contract compatibility belong to
**architecture**; exploitability of a boundary to **security**.
