### What to read first

- The production side of the diff before any test: list every new or changed behaviour (a
  branch, a return value, an error path, a limit) so you know what needs a test before you see
  what got one.
- Test files the diff touches, then the existing tests of the changed modules it does not
  touch: a changed behaviour whose old test still passes unmodified is the first thing to
  question.
- How the suite runs here: the test command, config, fixtures, doubles, CI script. Run it the
  way CI does.
- Shared helpers, factories and fixtures the new tests lean on, so you know what a test
  actually sets up.
- Any claim in the change description about what was tested; check it against the tree, not
  the text.

### Always check

1. New or changed behaviour has no test that fails without the change. **Major**. For each
   behaviour on your list, name the test that guards it. When it is not obvious, prove it:
   copy the tree to a temporary directory, revert the production hunk there, run the test; if
   it still passes, the behaviour is untested. Report the command and the result.
2. A test asserts implementation rather than behaviour: internal call order, private state,
   invocation counts on incidental collaborators, exact log text, the shape of an intermediate
   value. **Minor**; **Major** when it is the only test of the behaviour, since it breaks on a
   refactor and passes on a bug. For each assertion, name the observable outcome it protects.
3. The unit under test, or the component whose logic the change edited, is replaced by a mock,
   stub or fake, so the test exercises the double instead of the code. **Major**. For every
   double in the new tests, name what it stands in for; a double of the code under test or of
   a pure function the diff changed is the finding.
4. Edge cases the change introduces have no test: empty and single-element inputs, both sides
   of a new limit, the new error branch, absent optional fields, concurrent callers when
   shared state changed, the false side of each new conditional. **Major** for error branches
   and boundaries; **Minor** otherwise. Walk every new conditional in the diff and find the
   test that takes each side.
5. A test depends on wall-clock time, timezone, unseeded randomness, map or set iteration
   order, filesystem or environment state another test leaves behind, a live network
   endpoint, or sleep-based synchronisation. **Major**. Grep the new tests for time, random,
   sleep, env and network calls; run the changed tests alone and with their file, more than
   once, and report what you ran.
6. A test name does not state the behaviour and the condition (`test_handler`, `works`,
   `case2`), so a failure names nothing. **Minor**. Read the names in the diff; a good one
   reads as a sentence: what the code does, under what input.
7. Test data is unrealistic in a way that hides bugs: identical values where distinct ones
   would catch a swapped argument, zero and one for every number, empty strings where the real
   shape has structure, ids equal to their index. **Minor**; **Major** when the sameness would
   mask the bug the change fixes. Read fixtures and literals against the real input shape.
8. A test was deleted, skipped, marked flaky, had an assertion weakened or an expected value
   changed, with no reason in the change. **Major**. Diff test files for removed assertions,
   new skip markers, broadened matchers and edited expectations; each needs a stated cause.
9. A test passes trivially: no assertion, one that cannot fail, a catch-all that swallows the
   failure, an async test whose assertions run after the test has returned, a mirror assertion
   whose expected value is computed by the code under test, an `x ?? default` compared with the
   default, a change detector that asserts a constant's value, or an assertion on the mock
   rather than on the result. **Major**. Read each new test to its last line and confirm the
   assertion is reached, bound to the result, and would fail on the smallest realistic
   regression (invert the branch, drop the default, omit the field): name that regression.
10. The suite was not run, or was run and not reported. **Major** on your own output: run the
    suite the way CI runs it and the changed tests in isolation; report the exact commands,
    the pass and fail counts, and every failure with its message. If you could not run it,
    set `verified: false` and state what you would have run.
11. A changed user-facing behaviour is tested at the wrong level only: a unit test on a helper
    while the path users hit is untested, or an end-to-end test standing in for a missing
    unit test of the logic. **Minor**. Put the test where the change's risk lives.

### Common false positives

- Mocking a genuine external collaborator (network service, clock, database, message bus,
  filesystem) is correct design; the finding is a double for the code under test.
- A pure refactor needs no new test when the existing tests cover the moved logic and still
  pass; confirm by running them, then say nothing.
- Asserting a mock's arguments is behaviour, not implementation, when the call is the
  behaviour: the message sent, the record written, the event published.
- Missing coverage of an input the code cannot receive (validated upstream, forbidden by the
  type system) is not an edge case; name the real producer before filing it.
- One table-driven or parameterised test with a descriptive case list is as good as many
  named tests; do not ask for one function per case.
- A test that uses a fixed seed, a fake clock or a deterministic fixture is not flaky for
  mentioning time or randomness.

### What this type does not cover

Whether the production code is right in itself belongs to **coding-practices** (and **security** for hostile input); where tests live in the tree belongs to **code-structure**.
