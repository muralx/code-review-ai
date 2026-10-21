### Persistence specifics for testing

SQL that never runs is untested, and a database test that connects as a superuser tests nothing a
policy protects. The pack holds persistence code to a real engine behind a tag, with the
application's own role.

### Always check (persistence)

1. Store or repository code is tested against a mocked driver, a mocked connection or a different
   engine standing in for the target, so the SQL text never executes where it will run. **Minor**
   at best; **Major** when the change edits query text, a migration or a row policy. List the
   doubles; name the tagged integration test that runs the statement for real.
2. A new migration has no test that applies it from the previous version and from empty, runs its
   down, and re-applies it. **Major**. Find the test that invokes the runner; run it.
3. Row policies or tenant scoping are tested on a connection opened as the owner or a superuser,
   or not at all, so every cross-tenant assertion passes vacuously. **Major**. Read the user the
   test database setup connects as; the test must connect as the application role, assert zero
   rows across tenants and a rejected cross-tenant write.
4. The transaction wrapper and stores have no integration test for rollback on error (no partial
   rows remain) and for the conflict path (a duplicate key produces the domain sentinel). **Major**.
   Grep the adapter tests for the rollback assertion and the conflict sentinel.
5. Integration tests share one database or schema across packages or parallel tests with no
   isolation (per-test schema, truncation between tests, or a rolled-back transaction per test), so
   they collide or depend on order. **Major**. Read the test database setup; run two packages in
   parallel and report.
6. The engine or version under test differs from the deploy (an in-process engine standing in, an
   image tag two majors apart), or a tree that supports several engines runs the suite against one.
   **Minor**; **Major** when the change uses an engine-specific feature or edits SQL both engines
   must run. Compare the test image with the deploy manifest and the CI matrix.
7. An append-only table or a grant has no test that the forbidden statement fails as the
   application role. **Major**. Grep the tests for an update or delete expected to fail.
8. The test schema is created by hand (DDL in a fixture) instead of by running the migrations, so
   the tested schema and the deployed one diverge. **Major**. Read the test setup; it must call the
   runner.

### False positives (persistence)

- A unit test of a query-building helper with no database; only the executed statement needs the
  engine.
- Fakes at the store port in use-case tests; that seam belongs to the service layer, not to the
  persistence tests.
- Integration tests skipped locally when no container runtime is present, when a CI job runs them;
  confirm the job, then say nothing.
- A container shared by a package with per-test schema or truncation isolation.
