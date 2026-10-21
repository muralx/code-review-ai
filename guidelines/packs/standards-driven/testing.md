### Standards-driven specifics for testing

Conformance tests encode the standard, and the tree's conformance catalog (or the sibling
catalog repository mounted for the run) is what they must assert. Test code follows the
catalog, never the reverse: an implementation change that breaks a conformance test is a
finding against the implementation until the catalog says otherwise.

### Always check (standards-driven)

1. A conformance test no longer matches its catalog entry: a different expected outcome, a
   dropped or loosened result assertion, a changed error category, or a case skipped so an
   implementation change passes. **Major**; **Critical** when the test now accepts what the
   entry says to reject. Locate the entry by case ID in the in-tree catalog or the sibling
   clone (`../<catalog>/`); compare field by field. When the catalog is not mounted, say so,
   set `verified: false`, and do not approve the test change on the strength of the diff.
2. The change edits the catalog itself and an added or changed assertion cites no normative
   clause, cites one that does not support it, or weakens an existing assertion without a
   cited basis. **Critical** for a weakening or a contradiction of the standard; **Major** for
   an untraceable assertion. Look the cited section up in the tree's copy or the published
   text; a draft-based case must say so in the entry rather than read as published text.
3. A case ID is renamed, removed or reused for materially different behaviour. **Critical**
   for rename or removal without the consuming suites updated in the same change set;
   **Major** for reuse. Grep every consumer available to the run (sibling clones, test
   bindings, reports) for the ID; the orphaned binding is the evidence.
4. A MUST-level requirement stated in the entry's summary, the test's docstring or its name is
   not asserted by the test body. **Major**. Read the assertion lines against the stated
   requirement; a test that only checks "no error" for a requirement about content is the one.
5. New coverage for a surface is positive-only: none of the negative cases the standard's
   security-considerations section names for that surface (downgrade, algorithm or type
   confusion, issuer, audience or key mismatch, replay, expiry, wrong binding). **Minor**,
   naming the specific case to add; **Major** when the standard marks the rejection MUST.
   Open the section, list the attacks that touch the surface, find one test per attack.
6. A conformance assertion bakes in one language's error string, exception type or
   serialisation quirk instead of the catalog's language-neutral shape (error category,
   status, field presence). **Minor**; **Major** when a sibling implementation could not pass
   the same case. Compare the assertion with the entry's expected block.
7. A known-answer vector taken from the standard (appendix examples, published test vectors)
   is edited so the test passes. **Critical**. Diff the fixture against the standard's text.

### False positives (standards-driven)

- An implementation-specific test stricter than the catalog, kept outside the conformance
  suite and not bound to a case ID.
- A case the catalog marks as draft or optional whose test is gated or skipped with the
  catalog's own marker.
- Negative cases covered by a shared table or harness that runs every attack against every
  surface; find the row before filing the missing case.
- Test function names changing while the case-ID binding (tag, attribute, table key) stays.
- The catalog absent from the run: that is `verified: false` on your output, not a finding
  against the author.
