### Quality-gates specifics for testing

Coverage is measured by running the suite with the coverage tool the tree uses, never
estimated by reading. The floor is 85% of lines on the files the change touches unless the
project declares another threshold in its coverage configuration or CI; the declared number
wins.

### Always check (quality-gates)

1. Line coverage of a file the change adds or modifies is below the floor, measured after the
   change. **Major** when an uncovered line is a branch the change adds; **Minor** otherwise.
   Run the suite with per-file coverage output (examples: `go test -coverprofile=...`,
   `pytest --cov --cov-report=term-missing`, `vitest --coverage` or `jest --coverage`, JaCoCo
   through the build); cite the per-file numbers for the changed files, not the tree-wide
   aggregate, and read the uncovered line ranges.
2. Coverage was asserted without running. **Major** on your own output. Report the command,
   the per-file numbers and the floor you compared against; `verified: false` with the
   command named when the suite cannot run here.
3. The number is reached by tests that execute code without asserting on its outcome (a loop
   that calls every function, a snapshot of everything, a test with no failing condition):
   coverage without assertions is theatre. **Major**. Read each new test that covers the
   changed lines to its assertion; the general's trivially-passing-test rule applies, and the
   lines such a test covers do not count toward the floor.
4. Conformance, contract, alignment or schema-compatibility checks the tree has (a catalog
   coverage test, a consumer contract suite, a breaking-change check) were not run, or were
   run and not reported. **Major** on your own output. Find the targets in CI and the build
   files; run them; cite the output.
5. Coverage configuration is lowered in the diff, or files, directories or lines are excluded
   from measurement (`pragma: no cover`, `istanbul ignore`, an `exclude` entry) without a
   reason. **Major** when the excluded code is a branch the change adds; **Minor** otherwise.
   Diff the coverage config and grep the diff for exclusion pragmas.

### False positives (quality-gates)

- Files the project's coverage configuration excludes by convention: generated code, entry
  points, wiring, test helpers.
- Coverage below the floor on files the change does not touch; that is pre-existing and goes
  in one `follow-up` line.
- A project-declared floor other than 85%; the declaration governs, cite it.
- A branch the type system or an upstream validator makes unreachable, when the exclusion
  pragma says so.
