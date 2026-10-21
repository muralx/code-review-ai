### Website specifics for code-structure

Parts of a website tree are owned by tooling: the route tree, the generated API types, the
generated component-library files. The rest follows a feature-folder convention with public
barrels and a split between presentational and orchestrating code. The typical defect is a hand
edit to a tool-owned file or an import that erodes a feature boundary.

### Always check (website)

1. A generated file is edited by hand: the route tree, the generated API client or types, a
   generated component-library file beyond what its generator allows. **Major**: the next generator
   run (often a pre-build or pre-test step) reverts the edit. Find the generator in the package
   scripts with its output path; a hunk inside the output is the finding; run it again and diff.
2. A route file is renamed, moved or re-cased in a file-based router, changing the URL, while
   links, redirects or tests still name the old path. **Major**. Grep the tree for the old path
   string and for navigation calls to it; read the router's naming rule before judging casing.
3. Casing conventions are mixed or a documented exclusion is "fixed": component files, hooks,
   non-component modules and folders each have a casing in this tree, and route files or
   generated components may be exempt. **Minor**; **Major** when the rename breaks tooling (the
   generator's lookup, a case-only rename on a case-insensitive filesystem). List the siblings.
4. A cross-feature import reaches into another feature's internals instead of its public barrel,
   an intra-feature import goes through the feature's own barrel (a cycle), or a cross-cutting
   module imports a feature. **Minor**; **Major** for the cycle. Grep diff imports for
   `features/<other>/` deeper than the barrel; run the tree's import-boundary tool when configured.
5. A default export or import is added where the tree is named-export only, or a non-component
   value is exported from a component file where the fast-refresh lint rule forbids it outside
   the exempted directories. **Minor**; **Major** when a zero-warnings lint gate now fails. Run
   the configured lint; grep `export default` in the diff.
6. Orchestration sits in a presentational directory (data hooks, navigation, side effects, query
   keys inside `components/`), a route file carries a whole screen's logic instead of delegating,
   or a mock or fixture module is imported from production source outside the dev-gated entry.
   **Minor**; **Major** for the mock import, which can ship. Grep `src/` for mock-directory imports.
7. A query or cache key is written inline as a literal array where the tree has a key factory, so
   a mutation's invalidation target and the query it should refresh are spelled apart. **Minor**;
   **Major** when they already differ (the list stays stale after a successful write). Grep the
   diff for inline key arrays; compare each invalidation with the query key it targets.
8. A style value is hard-coded where the tree defines a token for it (a hex literal, an arbitrary
   spacing value), or class strings are assembled with a pattern the tree's class helper exists to
   replace. **Minor**; **Nit** for one value. Grep for hex literals; compare with the token file.

### False positives (website)

- Route files and generated component files in a different casing from the rest of the tree are
  a documented exclusion, not inconsistency; read the convention before filing.
- A generated file changing because the generator ran (route added, contract regenerated) is
  expected; the finding is a hunk the generator would not produce.
- A barrel at the feature's public boundary is the tree's pattern; the language amendment's
  caution applies to barrels added below that level.
- A route file that composes hooks and passes props down is orchestration in its place; thin is
  the bar, not empty. An inline key for a one-off read nothing invalidates is a Nit at most.
