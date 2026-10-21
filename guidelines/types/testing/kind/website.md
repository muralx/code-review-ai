### Website specifics for testing

Most of a website's suite runs without a browser, against fakes at the ports and an interception
layer for the network; a few journeys run in a real browser. The user drives the app through
roles and labels, so a test that passes through DOM structure or an unhandled request proves little.

### Always check (website)

1. A test fires a request nothing handles: the interception layer is not set to fail on unhandled
   requests, a new endpoint has no handler, or a handler is registered globally so every test
   sees it. **Major**: the test passes against a network error or a stale fixture. Read the
   setup's unhandled-request policy; pair each endpoint the diff calls with its handler.
2. The double sits above the port: the data hook, the query client, the store or a child
   component is mocked, so the code between the port and the DOM is unexercised and the test
   restates the mock. **Major**. For each mock target in the new tests name the layer it
   replaces; only a port fake or the request-interception layer is at the right seam.
3. A component test asserts structure instead of behaviour: `querySelector`, class names, test
   ids on elements that have a role, a whole-tree snapshot, a store's internal state instead of
   rendered output. **Minor**; **Major** when it is the only test of an interactive surface,
   since it passes with a broken control. Count role, label and text queries against these.
4. A new or changed interactive surface (route, dialog, form, menu) has no automated
   accessibility scan, the scan runs a lower level than the tree's (WCAG AA is the floor), or
   serious and critical violations are filtered out. **Major**. Read the scan configuration
   (tags, impact threshold); pair each new surface with its scan; run it when the toolchain allows.
5. A new client-side route is missing from the tree's focus-management test (focus moves to the
   new view's heading or main landmark; a dialog restores focus to its trigger). **Major** when
   such a test exists; **Minor** when the tree has none. Read the test's route list.
6. A spec in the pull-request-gated end-to-end suite depends on a live backend, a real session
   or credentials from the environment where the suite's default is hermetic (mock mode, fake
   gateway, request interception). **Major**. Read the e2e config's server command and env;
   grep specs for non-local URLs and credential reads.
7. A wire type changed and its runtime schema mirror or contract fixture did not, or a new wire
   type has no mirror where the tree keeps them. **Major** for a stale mirror (the contract test
   asserts the old shape); **Minor** for a missing one. Diff types beside schemas; run those tests.
8. The change description or a document claims a coverage threshold the runner does not enforce
   (no thresholds in the coverage config, CI only uploads the report). **Minor**; **Major** when
   the claim justifies omitting tests. Read the coverage config and the CI job; cite the absence.
9. A test leaks into the next: a handler override not reset after each test, fake timers not
   restored, a shared store or query cache, a fixed sleep instead of `findBy*`/`waitFor`.
   **Major**. Read the setup for per-test reset; run the file alone and inside the suite.

### False positives (website)

- Rendering with the real query provider over a port fake is the correct seam, not a mocked
  network; the finding is a mock of a module under the UI directory.
- A test id on an element with no natural role (a chart canvas, a layout container) where the
  tree allows it; role-first is the bar for interactive elements.
- A presentational change that adds or alters no interactive element needs no new scan; the gate
  is per surface, not per commit. A scheduled staging smoke suite excluded from the pull-request
  job is a legitimate live test; the finding is a live dependency in the gated suite.
