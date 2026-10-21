### Spec specifics for testing

There is no code under test; what can run is whatever the corpus uses to keep itself coherent: a
link or anchor checker, a validator for machine-readable catalogs, a script that checks example
payloads against the shape they illustrate. When the tree has none of these, the reviewer runs the
equivalent greps by hand and says so.

### Always check (spec)

1. The tree ships a checker (link, anchor, schema, example validator) and the change did not run
   it, or it fails. **Major**. Run every script the README or task runner names and report the
   command and result; with no checker, the anchor grep from the documentation checks is the test.
2. A machine-readable artifact in the corpus (a conformance catalog, a case list, a schema file)
   gains or changes an entry that fails its own validator, has a duplicate ID, or uses a taxonomy
   value (surface, priority, category) no sibling entry uses. **Major**. Run the validator; grep
   the field's values across the file.
3. An identifier in a machine-readable artifact that implementing repositories bind to (a case ID,
   a requirement ID) is renamed or removed without an additive path (new ID, old marked
   deprecated) and without the coordinated downstream change shown. **Critical**: every bound test
   is orphaned silently. Grep the sibling clones for the old ID.
4. An assertion in a machine-readable artifact has no traceable normative basis: the cited section
   does not say what the expected outcome requires, or a requirement is stated in the rationale
   and not asserted. **Major**; **Critical** when the assertion contradicts the cited standard.
   Open the cited section; pair each expected outcome with a sentence in it.
5. An example payload, fixture or fenced block in a document does not match the shape the text
   beside it fixes (a field the table lacks, a different casing, an enum value not listed).
   **Major**: implementers copy examples. Validate the example against the schema when one exists;
   otherwise diff it field by field against the table.
6. A language-neutral artifact bakes in one implementation's error string, type name or
   serialization quirk as the expected result. **Major**. Read each expected value; a token only
   one language produces is the finding.

### False positives (spec)

- A corpus with no checker and no machine-readable artifact has nothing for this type to run; file
  nothing rather than asking for tooling, unless a renumber in the change makes an anchor checker
  the only way to prove the citations hold (then Minor, once).
- A tightened assertion grounded in the cited standard is a legitimate behaviour change, called
  out once; only an ungrounded or loosened one is a defect.
- Example payloads marked illustrative or abbreviated (`...`) are not fixtures; the test is
  whether the text presents them as complete.
