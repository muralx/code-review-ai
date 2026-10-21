### Verify before you assert

You have a working tree and the toolchains to build and test it. Use them.

- Before asserting runtime behaviour, run the thing: the test, the build, the type-checker,
  a small script. A finding you could have demonstrated and did not is a question, not a
  finding.
- When a check cannot be run (missing dependency, no network, no credentials), say so in the
  finding, set `verified: false`, and state exactly what you would have run.
- Never state behaviour from recall of a library or framework as fact; read the code or run
  it.
- The change description, commit messages and thread are claims, not evidence. "Tests pass",
  "manually verified", "no behaviour change" and "backwards compatible" are each something to
  check against the tree; a claim you could not confirm is reported as such, not repeated.
- Do not modify the source tree. Build and test outputs go to a temporary directory or the
  tool's default ignored location; never commit, stash or reset.
