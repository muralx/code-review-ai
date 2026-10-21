### Spec specifics for spec-compliance

The "specification" the change must satisfy is not a document in this tree; it is the ticket,
decision or review thread that motivated the change, and the change is itself normative text that
other repositories will implement. Scope creep here is not dead code; it is an unrequested rule
that ships.

### Always check (spec)

1. The normative content the change adds or edits goes beyond what the motivating ticket or
   decision asked: a second rule settled in passing, a value fixed that the ticket left open, a
   section rewritten when a sentence was requested. **Major**: every unrequested normative
   sentence is a decision nobody made. Read the ticket (or the change description when no tracker
   is reachable); list each normative hunk and pair it with a sentence in the request.
2. The change does less than the request: a ticket asking for a rule across several documents
   lands in one, a requested breaking flag or migration note is absent, a requested decision entry
   is not written. **Major**. Pair each requirement of the request with a hunk; the unmatched
   requirement is the finding.
3. The decision the change embodies is not recorded in the log the corpus keeps for that decision
   series, or is recorded with a status (open, locked, superseded) that does not match the text.
   **Major**: the change may be the only place the decision exists. Grep the log for the subject;
   compare the status with what the new text asserts.
4. The change title or description names a ticket that does not match the content (a different
   subject, a closed or superseded ticket, a placeholder ID). **Minor**; **Major** when the named
   ticket's decision was the opposite. Read the ticket when the tracker is available; otherwise
   set `verified: false` and say so.
5. The change resolves an open question by removing it from the open list without the text that
   resolves it, or adds normative text while leaving the question listed as open. **Major**. Diff
   the open-questions table beside the normative hunks.
6. Reconciliation changes (sweeping a rename, aligning citations) are mixed with new normative
   content in one change, so the reviewer and the changelog cannot tell which sentences are new
   rules. **Minor**. Count the hunks of each kind; recommend the split once.

### False positives (spec)

- A citation fix, typo correction or anchor update in a document the ticket did not name is the
  ripple sweep the architecture checks demand, not scope creep.
- A change that records a decision as open rather than settling it has done what a ticket asking
  for "a decision" could not; the open entry is the deliverable.
- Normative text that restates, by reference, a rule already fixed elsewhere is not a new rule.
