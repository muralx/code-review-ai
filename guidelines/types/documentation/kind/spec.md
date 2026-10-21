### Spec specifics for documentation

Every document is the product. Code rules do not apply, and the general checks about code
matching docs invert: the implementation lives elsewhere and cites this corpus by file and section
number, so structure, anchors and conventions are load-bearing and prose style is not.

### Always check (spec)

1. A section is renumbered, split, merged or removed and an inbound citation (`<file> §<n>` or
   its equivalent) still points at the old number. **Major**; **Critical** when the citation is in
   a code repository's comment or doc, since nothing there will fail. Before accepting any change
   to heading numbers, grep the corpus and every sibling clone for the file name beside the old
   section number; every hit must move in the same change. Prefer appending sections.
2. A changelog entry is missing for a normative change, sits inside an individual document when
   the convention is one repository-level changelog (or the reverse), or logs a breaking change
   as routine. **Minor**; **Major** when breaking is mislabelled. Read the changelog convention
   the README states; map each normative hunk to an entry.
3. The version marker is not bumped where the convention requires it, or is bumped without the
   release steps the convention lists (moving the unreleased section, dating it, adding the
   compare link). **Minor**. Read the convention; compare with the diff.
4. A decision is recorded in the wrong log, under an ID series that belongs to another document,
   or not recorded when the change settles something. **Minor**; **Major** when the decision
   contradicts an entry in the right log. Grep the ID series; read where it lives.
5. Placeholder prose fills a section: "TBD", "standard handling applies", "the usual conventions",
   a heading with one sentence that restates it, a template token left in, a guidance comment
   never removed. **Major**: it is an unfilled section that reads as filled. Grep for the
   placeholder patterns; read each short section in the diff and ask what an implementer could
   build from it.
6. A term is used as if defined and is not in the glossary or defined at first use; or two names
   denote one entity; or an enumerated value is "one of several kinds" with the kinds listed
   nowhere. **Major**. Build the term list from capitalized and back-ticked domain nouns in the
   diff; look each up.
7. A cross-reference does not resolve: a cited document, section or decision ID that does not
   exist or does not say what the citation claims; a reference into a local-only or ignored
   directory that other readers do not have. **Major**. Open every reference the diff adds.
8. Normative keywords (MUST, SHOULD, MAY in capitals) are introduced into a corpus that carries
   normativity by prose, bold or decision status and declares no keyword convention. **Minor**: it
   creates two normativity systems. Grep the corpus for the keyword boilerplate; absent, the new
   capitals are the finding. Never ask a corpus without the convention to adopt it.
9. A placeholder ticket or issue ID (`XX-NNN`, `TICKET-123`, `TBD-1`) survives in normative text
   or in the change title. **Minor**. Grep the placeholder pattern in the diff.

### False positives (spec)

- Heading capitalization, table formatting, sentence length and wording are not reviewed; the
  authors are the domain experts.
- Internal ticket IDs and private repository names in a private corpus are the convention, not a
  leak; the general leak check applies only to text on a public path.
- A document that is history-free because the convention keeps history at repository level is not
  missing a changelog.
- A short section whose single sentence is a complete rule ("the slug is immutable after
  creation") is not a placeholder; the test is whether an implementer can act on it.
