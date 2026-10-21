### Service specifics for performance

A service pays its cost once per request times every caller times every replica: latency is
mostly round trips, connections are the scarce resource, and a target that is not a number
under a stated load is not a target. Timeouts, retries, backpressure and rollout belong to
**system-design**; this file counts and measures.

### Always check (service)

1. Round trips per request grew: a new call to a store or a downstream per request, or per
   element of the response, where one batched call or a join would do; an N+1 across services
   (a downstream called once per item of a list). **Major**. Count outbound calls per request
   at one item and at fifty with the tree's client instrumentation or a counting double; cite
   both numbers.
2. A connection is not reused: a client or transport built per request, keep-alive disabled, a
   pool sized below the handler concurrency so requests queue on it, or far above what the
   downstream accepts, a name resolved per call. **Major**. Read the client constructor and its
   pool and keep-alive settings beside the configured worker or handler concurrency; name both
   numbers.
3. Payload size with no bound: a list endpoint with no default or maximum page size, whole
   entities returned where callers read a few fields, a body returned uncompressed where
   sibling endpoints compress. **Minor**; **Major** when size grows with user data and nothing
   caps it. Measure response bytes at a representative row count and cite them.
4. A new or changed endpoint has no latency target stated as numbers with load assumptions
   (p50, p95, p99 at a request rate, payload size and concurrency), or a target the project
   states (performance test thresholds, an SLO file) is exceeded by measurement. **Minor** for
   the missing target; **Major** for the exceeded one. Run the project's load tool (`k6`,
   `vegeta`, `wrk`, `hey`, whichever the tree has) at the stated load on base and head; cite
   the percentiles.
5. Work in the request path that the response does not need: an audit write, a notification,
   a metrics flush, a cache warm, done synchronously before replying where the tree has a
   queue, outbox or background worker. **Major** on a latency-sensitive endpoint. Time the
   handler with and without the step and cite both.
6. Cost added to every route for one route's need: a middleware that buffers the body, signs
   the full payload, or performs a remote lookup on every request. **Minor**; **Major** when it
   adds a remote call to every request. Measure per-request overhead with the middleware on
   and off.

### False positives (service)

- A round trip the tree's request-scoped cache or dataloader already de-duplicates; trace to it
  before counting.
- A pool size set by the platform at deploy time rather than in code; read the manifest.
- Compression deliberately off for small or already-compressed payloads (images, encrypted
  blobs).
- An endpoint explicitly classed as batch or administrative with a stated tolerance; do not
  hold it to the interactive target.
- A missing latency target on an internal endpoint whose caller's deadline is stated and far
  above the measured p99; **Nit** at most.
