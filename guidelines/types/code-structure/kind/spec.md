### Spec specifics for code-structure

The tree is documents, indexes and logs; structure means a reader, or a citing repository, can
find a document by its number and a section by its anchor, and that the layout the corpus
promises is the layout the tree has.

### Always check (spec)

1. A new document breaks the numbering or naming scheme the corpus uses (prefix number, case,
   separator, suffix), or two documents claim one number. **Minor**; **Major** when citations by
   number become ambiguous. List the directory; compare the new name with its siblings.
2. Headings inside a document do not follow the anchor scheme other documents cite (numbered `N.`,
   `N.M` levels), or a heading level is skipped so a section has no citable number. **Major**: it
   cannot be referenced. Read the heading tree of each changed document.
3. Content is placed where readers will not look: a cross-component rule inside one component's
   document, a component detail inside a shared backbone document, an operational runbook inside
   the architecture corpus or the reverse. **Minor**; **Major** when the misplacement makes a
   backbone rule invisible to the components it governs. Read the README's statement of what
   lives where.
4. A generated or maintained index, table of contents or document list is not updated for a
   document the change adds, renames or removes. **Minor**. Diff the index against the directory
   listing; run the generator when the tree has one.
5. A versioned document references a directory the repository ignores or does not ship (a
   local-only decision folder, a review-tool folder), so the reference dangles for every other
   reader. **Major** when the referenced content is normative and inlined nowhere; **Minor** for an
   informational pointer. Read the ignore file; stat the referenced path.
6. A decision log, glossary or changelog is duplicated: the same ID series in two files, a second
   glossary, a per-document history beside the repository-level one. **Minor**; **Major** when the
   copies already disagree. Grep the series or heading across the tree.

### False positives (spec)

- A document outside the numbering scheme that the README explicitly lists as such (a playbook, a
  carried-over draft) is the convention, not an outlier.
- An index maintained by a release step rather than per change is not stale on the branch; read
  the release convention.
- A pre-existing dangling reference the change does not touch is `pre-existing`, raised once with
  the count.
