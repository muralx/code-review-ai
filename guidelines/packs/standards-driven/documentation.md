### Standards-driven specifics for documentation

A compliance claim is a statement a consumer acts on when choosing a peer, a configuration
or a migration path. Docs on spec-implementing code cite the text they claim to follow, with
its status, and claim no more than a test proves.

### Always check (standards-driven)

1. Documentation or a comment describing spec-defined behaviour cites no document and section,
   or cites without status (published, draft and version, informational, ecosystem
   convention). **Minor**; **Major** when the sentence asserts conformance to a specific
   requirement. Open the cited section; the citation must point at the clause, not at the
   document's title.
2. A citation is stale after a revision of the standard: an obsoleted document, a section
   number that moved, "draft" on a document since published, or a published number on text
   that only exists as a draft. **Minor**; **Major** when the superseding text differs
   normatively from what the code does. Read the document's own status header (obsoletes,
   updated-by, expiry) in the tree's copy or the published text.
3. Prose claims compliance ("implements", "conforms to", "supports") with a requirement no
   test proves, or that the code contradicts. **Major**. For each claim, find the conformance
   test, test vector or catalog case that exercises it; a claim with no test behind it is the
   finding, and a claim contradicted by code is the same finding at the same severity.
4. A supported-features or compliance matrix disagrees with the discovery document the code
   publishes or with the code's own allow-lists. **Major**. Grep each listed entry in both;
   cite the one that matches the code.
5. A deviation from the standard is undocumented where a consumer reads (README, compatibility
   notes, reference entry), or documented without the normative level of the clause it
   departs from. **Major** when the clause is a MUST; **Minor** otherwise. Compare the
   implementation's behaviour on the surface with the clause and look for the note.
6. Docs use a term the standard defines with a different meaning, or rename a standard concept
   so a reader cannot map prose to the text. **Minor**. Compare with the standard's
   terminology section; cite both.

### False positives (standards-driven)

- A citation to an older revision when the tree declares that it targets that revision in a
  compatibility document; flag only if the declaration is missing.
- "Draft" on a document still in draft at review time; check status and date before raising.
- No citation on glue code that is not spec-defined (transport setup, logging, storage).
- One citation at package or file level covering a group of functions that implement the same
  section; per-function citations are not required when the scope is clear.
