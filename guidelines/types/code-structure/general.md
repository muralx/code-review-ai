### What to read first

- The tree around the diff: the package or directory of each touched file, its siblings, and
  any README, layout document or module index that states the intended boundaries.
- The dependency graph of the touched modules: what each imports now and what the diff adds.
  Use the toolchain's dependency listing or import-cycle check where one exists.
- Existing code with the same responsibility as the new code. Grep for the key nouns and
  verbs of the diff before you accept any new helper, type or module as novel.
- The public surface of the touched packages: exported names, entry points, published
  interfaces, and whatever the project marks as stable or versioned.
- Lint or architecture rules the repo already encodes (import restrictions, size limits,
  naming rules), so you can run them rather than argue.

### Always check

1. A dependency points the wrong way: a lower layer imports a higher one, a domain package
   imports a transport or storage adapter, a library imports an application. **Major**. Diff
   the import list of each touched file against the layering the tree documents or implies;
   cite the import line.
2. The diff introduces a circular import, or a cycle hidden by a late import, interface
   indirection or init-order trick. **Major**. Run the build or the toolchain's cycle check;
   if the language tolerates cycles at runtime, trace the cycle by hand and cite both edges.
3. A module, package or file mixes unrelated responsibilities after the change: two reasons
   to change, two unrelated sets of importers, utilities that share nothing but a filename.
   **Minor**; **Major** when it forces unrelated importers to depend on each other (a heavy
   dependency pulled into a light package). Read the export list and who imports each item.
4. New code sits where a newcomer would not look: a helper beside its first caller instead of
   with its kind, an adapter inside the domain, a test utility in production code. **Minor**.
   Name the place the tree already keeps this kind of thing; if there is none, it is not a
   finding.
5. A function, class or file grows past what the tree treats as normal, or the diff adds a
   long unit with several distinct phases. **Minor**; **Major** when a single unit now carries
   branches that cannot be exercised separately. Measure it (line count, the project linter's
   complexity metric) against the surrounding code; cite the numbers, not the impression.
6. Names in the diff disagree with the tree's conventions or with each other: one concept
   under two names, mixed casing or prefix style, a name that says one thing while the body
   does another. **Minor**; **Major** when a misleading name hides behaviour a caller relies
   on. Grep for the existing name of the concept and cite both.
7. The diff duplicates logic that exists elsewhere in the diff or in the tree: a copied block,
   a re-implemented helper, a second parser for the same format. **Minor**; **Major** when the
   copies will diverge on a correctness-relevant rule (validation, escaping, retry policy).
   Grep for a distinctive line or identifier from the block; cite both locations.
8. The public surface grows without need: exported names used only inside their package, a
   new entry point that mirrors an existing one, a widened signature or interface. **Minor**;
   **Major** when the package is consumed outside the repo and the addition is hard to remove.
   Grep every new exported name for callers outside its package; none is the finding.
9. A change to a shared module alters behaviour for importers the diff does not touch.
   **Major**. List the importers of the changed symbol, read the ones the change could break,
   and run their tests.
10. One logical change is spread across more files or packages than it needs, or one file must
    now change whenever another does. **Minor**. Count the files touched for the one change
    and name the coupling that forces it.
11. A type, constant or configuration value is redefined in a second module instead of
    imported, or things that belong together are split across modules. **Minor**; **Major**
    when the two definitions can drift (a status set, a limit, a wire-format field name).
    Grep for the name; cite each definition.

### Common false positives

- Duplication of a few lines where a shared helper would need more parameters than it saves,
  or deliberate copies between modules that must evolve independently (versioned APIs, test
  fixtures).
- A long file that is one cohesive table, schema, generated artifact or enumerated mapping.
  Size alone is not a finding.
- A new exported name that a sibling repository mounted for the review, a documented plugin
  contract, or a stated follow-up in the same change set uses. Check before raising.
- A wrong-direction import that is the tree's deliberate inversion pattern (an interface
  defined in the lower layer, implemented above it).
- Naming that follows an external standard (a wire-format field, a specification term, a
  vendor API) rather than local convention.
- Placement that matches an existing, documented convention of this repo, even if another
  layout is more common elsewhere.

### What this type does not cover

Idiom and correctness inside a function belong to coding-practices.
