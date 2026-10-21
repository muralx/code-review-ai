### Hexagonal-service specifics for testing

Ports give every layer a natural test seam: the domain tests with nothing, services test against
in-memory fakes of their output ports, adapters test against the real system behind a tag,
handlers test against a fake of the input port. The review checks that each test uses its seam
and that the fakes tell the truth.

### Always check (hexagonal-service)

1. A service test mocks an output port with scripted returns and call-count assertions where the
   tree ships a fake, or builds a bespoke stub per test. **Minor**; **Major** when the script hides
   a behaviour the fake would exercise (a second read returning not-found, a conflict on a
   duplicate save). List the doubles in each service test; compare with the adapters' fake
   packages.
2. A fake disagrees with its adapter: a different sentinel for the same condition, no conflict on
   a duplicate key, cancellation ignored, so service tests pass against behaviour production does
   not have. **Major**. Read the fake beside the adapter's error mapping; if the tree has a
   contract test run against both, run it.
3. A domain test needs infrastructure, a build tag, a clock or the network. **Major**: the island
   has a bridge. Run the domain tests alone with the network off; read their imports.
4. An adapter's integration test asserts only the happy path: no case that the not-found, conflict
   and unavailable conditions of the real system produce the domain sentinel. **Major**: the
   service's error handling depends on that mapping. Grep the adapter tests for each sentinel.
5. A handler test wires the real service and real adapters for every case (an end-to-end test
   standing in for the transport test), or asserts use-case outcomes instead of transport mapping.
   **Minor**. Read what the handler test constructs; a fake of the input port is the level.
6. The composition root has no test that builds the real graph from a valid config with fakes or
   containers behind the ports, so a nil dependency or a missing option is found at deploy.
   **Minor**; **Major** when constructors validate dependencies and an optional feature path passes
   nil through. Find the test that calls the root's builder.
7. A use case that performs several writes is tested only with a no-op fake transactor, so a write
   placed after the commit, or a publish placed inside it, passes. **Major**. Read the fake
   transactor; find the test that asserts what ran inside versus after the transaction.

### False positives (hexagonal-service)

- A mock where the interaction is the behaviour (published exactly once, with this subject).
- A fake with an error-injection hook used to exercise the service's failure branches.
- A handler test that uses the real service over fakes at the output ports, when that is the
  tree's established style for the transport layer.
- Table-driven domain tests with no doubles at all; that is the island working as intended.
