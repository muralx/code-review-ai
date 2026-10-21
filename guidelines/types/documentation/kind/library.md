### Library specifics for documentation

A library's documentation is what a consumer reads before, and instead of, the code; the
published surface, not the tree, is what the docs must match.

### Always check (library)

1. The README quick start does not take a new consumer from install to a working call: missing
   install line, import path differing from the package name, a symbol the version does not
   export, an omitted prerequisite. **Major**. Run it in a scratch project, from install onward.
2. An exported symbol has no reference entry or doc comment, or the entry omits a parameter, a
   default, a thrown error or an absent return the code can produce. **Major**. List exports
   with language tooling (doc generator, declaration file, doc lint); compare entry by entry.
3. A change that alters a consumer's compile or runtime result has no changelog entry, sits
   under the wrong heading (breaking logged as fixed), or lacks the migration steps a consumer
   must take. **Major** for breaking; **Minor** otherwise. Map each export change to its entry.
4. Published docs do not match an installable version: an unreleased symbol with no version
   marker, or no versioned entry for the release being cut. **Major** when a reader will call
   something their version lacks; **Minor** otherwise. Compare `since` markers with the manifest.
5. An example is not run by the test suite (no example test, doctest or compiled sample) and
   the diff changes what it calls. **Major** for the README example; **Minor** elsewhere. Find
   the test that runs it; if none, run it by hand and set `verified` accordingly.
6. A deprecated export names no replacement or removal version, or its doc comment still
   presents it as the recommended path. **Minor**; **Major** when the replacement does not
   exist yet. Read the deprecation marker and the symbol it points to.

### False positives (library)

- Doc comments on unexported or internal symbols are optional; the bar is the published
  surface only.
- A reference generated from doc comments at release time is not stale on the branch, and a
  changelog generated from commit messages or labels needs the label, not a hand-written
  entry; read the release tooling before filing either.
- Examples that need a credential or network the review environment lacks are
  `verified: false` with the command named, not broken examples.
