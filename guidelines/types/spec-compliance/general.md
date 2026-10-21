### What to read first

- The requirement source, in this order of authority: the requester context in the task block;
  a spec, plan, design or ADR file in the tree or a sibling clone that the change or its
  description cites; the linked issue or ticket text when the metadata directory carries it;
  the pull request title and description; the commit messages. Write the requirements out as
  one sentence each, numbered, before opening the diff.
- When none of those states a requirement: say so in one sentence of prose, review against the
  title and description only, and lower every missing-requirement finding by one level.
- The diff, hunk by hunk, mapping each hunk to a numbered requirement. Hunks that map to
  nothing and requirements that map to nothing are the two lists your findings come from.
- The tests the diff adds or changes, placed beside the acceptance criteria or stated
  behaviours; each criterion gets the name of the test that guards it, or "none".
- The description's claims about what was tested, verified or left unchanged, as a third list
  to check against the tree rather than against the text.
- In an audit: there is no change to compare, so the sources are the repository's spec and
  design documents and the code that claims to implement them. Findings are `pre-existing`,
  grouped by document section.

### Always check

1. A stated requirement has no code behind it: described as done, absent from the diff and
   from the tree; or a file, component or step the requirement or plan names by name is not
   touched by the diff, however clean the rest looks. **Major**. For each requirement, name the
   file and symbol that implements it; grep the tree for the identifier, route, flag, message
   or error code the requirement names. Absence after the search is the evidence.
2. Code implements something no requirement asked for: a new option, endpoint, flag or
   format, generality for a future case, a "while I was here" refactor that changes
   behaviour. **Minor**; **Major** when it changes behaviour other callers or users rely on.
   Take the list of unmapped hunks; for each one that changes behaviour, list the callers of
   what it changed and name one whose observable result differs.
3. A requirement is implemented with different semantics than written: a default flipped, an
   edge case redefined, an inclusive bound made exclusive, a different error code or status,
   ordering or case sensitivity changed. **Major**. Quote the requirement sentence and the
   code line side by side; when a harness exists, run the exact case the requirement names
   and cite the result.
4. An acceptance criterion or stated behaviour has no test that fails without the change.
   **Major**. Name the criterion and the test that is missing. Read the tests first; then
   run them; then, in a scratch copy, revert the production hunk for that criterion and run
   again. A suite still green after the revert is the evidence. Test design beyond this
   traceability belongs to **testing**.
5. The code deviates from the plan or spec in a way that is an improvement but is recorded
   nowhere. **Minor**. The finding asks for the description, or the spec, to record the
   deviation and its reason. Diff the plan's stated approach against the code; a deviation
   with a reason already in the description is not a finding.
6. An artifact the description says is unchanged, or does not mention, is changed by the
   diff: a migration, a public schema or API contract, a config default, a dependency
   manifest or lockfile, a generated file, CI configuration. **Major**. Group the files in
   the diff by category and compare with the scope the description states; name each file
   outside it.
7. A claim about testing or verification is not reproducible from the tree: "tests pass"
   with no test touched and no result attached, "manually verified" for a path with no
   automated check, "benchmarked" with no numbers. **Minor**; **Major** when the claim is the
   only evidence that a requirement is met. Run the suite and whatever the claim names; cite
   what exists and what does not.
8. A referenced spec section, ticket, ADR or document does not exist, or says something
   other than what the change attributes to it. **Major**. Open the reference; quote the
   change's reading and the source's actual text. A stale section number over correct content
   is **Nit**.
9. A requirement is deferred to a follow-up with no recorded destination: no ticket, no
   `TODO` at the site, no line in the description. **Minor**. Grep for `TODO` and `FIXME`
   naming the requirement; read the description for the deferral and where it goes.
10. A bug fix does not fix the reported bug: the reproduction in the issue or description
    still fails on the head, or the added test asserts the new behaviour without exercising
    the reported input. **Major**. Reproduce the stated problem on the base revision, then on
    the head, with the input the report gives; cite both results.
11. Two requirement sources disagree: requester context says one thing, the description or
    the spec another, and the code follows the lower authority. **Major** when the code
    follows the lower authority; **Minor** when they agree on behaviour and differ on
    detail. Quote both sources; review against the higher one and ask for the lower to be
    corrected.

### Common false positives

- A terse description with a small, self-evident diff: a one-hunk fix whose title names the
  behaviour has the diff as its requirement. File nothing for the brevity.
- A change explicitly declared a refactor with no behaviour change: scope checks do not
  apply. Settle it by running the existing tests on head and reading them for weakened
  assertions, not by asking for a spec.
- Tests, fixtures and helpers added beyond the stated requirement are not scope creep.
- Plan shape versus substance: the plan said "function X in file Y" and the code adds method
  X on type Z with the same behaviour. Verify behaviour, not placement; placement belongs to
  **code-structure**.
- A change that implements one named part of a larger spec, when the description says which
  part and what follows. Check that the named part is complete; the rest is not missing.
- A lockfile or generated file changed as the mechanical consequence of a dependency bump or
  schema edit the description does declare.
- A commit message that contradicts the description: the description is the higher authority
  and the commit message is history, not a requirement.
- Silence is not permission. A requirement that does not name an input or case does not clear
  the code's behaviour on it: judge that behaviour by what a reasonable user of the stated
  feature expects, and hand a crash or wrong result on such an input to **coding-practices**
  rather than dropping it because "the spec did not say".

### What this type does not cover

Whether the code is correct in itself belongs to **coding-practices** and **security**; the
design and quality of the tests to **testing**; whether the design fits the tree to
**architecture**; wire compatibility and rollout to **system-design**.
