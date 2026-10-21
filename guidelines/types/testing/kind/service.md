### Service specifics for testing

A service suite has three layers with different costs: unit tests with fakes at the ports,
integration tests against the real database, broker or upstream behind a tag, and end-to-end
flows. The review checks that each behaviour sits in the right layer and that every layer runs.

### Always check (service)

1. A test that needs a database, broker, container or network runs in the default (untagged,
   unmarked) suite, or is tagged but no CI job runs the tag. **Major**. Grep new test files for
   container, dial and connect calls and for the tag or marker; read the CI config for a job that
   runs it; a tagged test nobody runs is not a test.
2. A handler is tested by calling its function directly, bypassing the router and middleware
   chain, so authentication, body limits, error mapping and content negotiation on that route are
   never exercised. **Major** when the route is protected or mutating; **Minor** otherwise. Read how
   the test builds the handler; it must come from the tree's server or router constructor.
3. A new or changed route has no test per response it can produce: unauthenticated, forbidden,
   malformed body, domain-invalid, not found, conflict. **Major** for the auth and malformed cases;
   **Minor** for the rest. List the status codes the handler and the error mapping can return; name
   a test per code.
4. An adapter test replaces the client library or driver it adapts with a mock, so the SQL, wire
   format or protocol never runs. **Minor**; **Major** when the change edits query text,
   serialisation or protocol handling. For each adapter test name the real system or faithful
   local emulator it reaches, or the tag it hides behind.
5. A consumer or worker is tested by invoking its processing function with a message, never
   through the subscription path, so acknowledgement, redelivery, dead-lettering and concurrency
   settings are untested. **Major** when the diff touches ack, retry or ordering. Find the test
   that publishes to a real or embedded broker and asserts the ack outcome.
6. A new background loop, consumer or listener has no test that cancellation stops it, drains
   in-flight work and returns within the shutdown budget. **Major**. Find the test that cancels and
   asserts return; run it under the race detector or leak checker the toolchain offers.
7. Tests bind fixed ports, a shared database name or a shared topic, so two packages or two CI
   runs collide. **Major**. Grep for literal ports and database names; run two packages' tests in
   parallel and report the result.
8. The end-to-end suite is gated behind an environment variable or target CI never sets, so it
   never runs. **Minor**; **Major** when it is the only test of a flow the change alters. Read the
   CI config; grep for the gate.

### False positives (service)

- A fake at an output port in a use-case test is the right double; the general rule on mocking
  the unit under test already allows it.
- An integration test absent from the fast suite by tag is the design, not missing coverage;
  confirm a CI job runs the tag, then say nothing.
- A unit test of pure request mapping beside a chain-level test of the same route; both levels
  are legitimate.
- A readiness test that injects a failing dependency check is testing the probe, not faking it.
