### Contracts specifics for testing

The tests are the only thing in this module that runs, and often the only gate: there may be no
CI, and the production code that fails is in another repository. A test here guards bytes on a
wire, not a function.

### Always check (contracts)

1. A wire shape changes with no test pinning the new bytes, or compatibility is claimed with no
   test proving the old bytes still decode or verify. **Major**; **Critical** when the shape is
   signed. Find the test that encodes a fixed input and compares the output bytes, and the one
   that feeds a frozen old-version sample through the new decoder; either missing is the finding.
2. A codec that signs or MACs has no test for each hostile input: tampered payload, tampered
   signature, wrong key, replayed signature over a different payload, expired, malformed parts,
   wrong key length. **Major**. List the verify function's rejection branches and name the test
   that takes each; the replay case (valid signature, swapped payload) is the one most often
   missing.
3. A wire shape has no golden file, or a golden exists and the test does not compare bytes (it
   round-trips instead, so any symmetric change passes). **Major** for a signed or routed shape;
   **Minor** otherwise. Read the assertion: decode-then-encode equality is not a pin.
4. Two names for one wire value are not cross-checked: an HTTP header name against the RPC
   metadata key it mirrors, a kind string against its subject, an aliased type against the shape
   it aliases. **Major** when they can drift separately. Find the test that asserts the pair equal
   or derives one from the other; absence is the finding.
5. Generated code is not covered by a drift test: nothing regenerates from the committed schema
   and diffs against the committed stubs. **Major** when the module ships generated code. Run the
   generator yourself into a temporary directory and diff; report the command and whether the
   tree is clean.
6. A permission matrix or routing table is tested by spot checks only: a few cells asserted, with
   no invariant test (deny-by-default on unknown input, the top role holds everything, every
   permission has at least one role, every kind has a subject and a class). **Major**. Read the
   matrix tests; a change to an unasserted cell passes silently.
7. The module's suite was not run against the consumers that import it: sibling clones mounted
   for the review are not built against the changed module. **Major** when a sibling is available
   and not tried. Point the sibling's manifest at the working tree, build and test, and report the
   result; set `verified: false` when no sibling is mounted.

### False positives (contracts)

- A table-driven test enumerating every matrix cell is a complete pin, not spot checks; count the
  rows against the matrix before filing.
- A round-trip test beside a byte-pinned golden is fine; the finding is a round-trip standing
  alone.
- Missing hostile-input tests for a codec with no secret (a plain JSON event envelope) are a
  general-testing concern at most; the tamper suite is for signed or MACed shapes.
