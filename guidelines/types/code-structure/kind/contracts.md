### Contracts specifics for code-structure

Every package in the module is compiled by every service that imports anything near it, so the
package boundary decides which dependencies and which change cadence a consumer inherits.

### Always check (contracts)

1. Two contract families share one package: a codec beside an event catalog, a permission matrix
   beside RPC stubs, so a consumer that needs one compiles and depends on both. **Major**. List
   the module's packages and the importers of each in the sibling clones; a package imported for
   one symbol while carrying another family is the finding.
2. Generated and hand-written code sit in one directory, or a hand-written helper is placed under
   the generator's output path. **Major**: regeneration deletes or buries it, and a reviewer
   cannot tell which files to read. Check the generator's output directory for files without its
   banner.
3. A standard-library-only package and a generated package that pulls a runtime share a
   directory, an import path prefix the consumer's tooling treats as one unit, or a common
   internal helper. **Major**. Trace the import graph from each light package; any edge into a
   heavy one is the finding.
4. A shared `util`, `common` or `internal/helpers` package appears, imported by several families.
   **Major** when it carries a dependency or when it means every family changes whenever it does;
   **Minor** otherwise. Read its import list and its importers.
5. A wire-format name (kind string, header, subject, tag) is defined in more than one place inside
   the module, or its documentation and its definition live in different packages with no
   cross-reference. **Major** when the copies can drift. Grep the literal.
6. The schema source tree and the generated tree do not mirror each other (a version directory in
   one, a flat layout in the other), so a new version cannot be added without moving files.
   **Minor**. Compare the two trees' layouts.
7. Test fixtures that are contract artifacts (goldens, sample tokens) are mixed with ordinary test
   helpers, or are not where the tests of that shape live. **Minor**; **Major** when a fixture is
   shared across families so one family's change rewrites another's pin. Locate each golden
   beside the test that reads it.

### False positives (contracts)

- A single package doc or README at module root describing every family is documentation, not a
  shared package.
- A generated package depending on its runtime and on other generated packages of the same IDL is
  the generator's layout, not a coupling finding.
- Test-only helpers scoped to one package (a key generator, a fixture loader) are not a shared
  utils package.
