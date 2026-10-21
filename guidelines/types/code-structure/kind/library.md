### Library specifics for code-structure

In a library the tree's layout is the contract's edge: whatever the packaging reaches is public,
whatever the public package imports every consumer installs, and whatever is generated must
come back identical from its generator.

### Always check (library)

1. Code meant as implementation is reachable by consumers: outside `internal/` in a Go module,
   without a leading underscore or outside `__all__` in Python, exported from the package entry
   or listed in the `exports` map in TypeScript, `public` in a non-internal Java package or an
   exported module. **Major**: it becomes contract the moment it is published. List what the
   entry point reaches; the language amendment names the mechanism and tooling.
2. More than one way in: README, examples or tests import a deep path (`pkg/internal/x`,
   `dist/sub/file`, a submodule) because the root does not re-export it, or the diff adds such
   a path to documentation. **Minor**; **Major** when the deep path is documented, since moving
   the file is then a break. Grep docs and examples for import paths below the root.
3. An adapter or integration module (framework middleware, driver, plugin) contains behaviour
   every consumer needs (validation, retry, parsing, defaults), or the core imports the
   adapter's framework. **Major**: the surface splits and the two copies drift. In the adapter,
   list functions with no framework-typed parameter; in the core, list imports of the
   framework.
4. A file with a generated header is edited by hand, or its generator or source (schema,
   specification, template) is not in the tree or not runnable. **Major**: the next generation
   drops the edit. Grep generated markers in the diff; re-run the generator into a scratch
   directory and diff.
5. The root or public package imports an optional integration (web framework, database driver,
   cloud SDK), so a consumer of the core pays for it. **Major**. Print the public package's
   dependency closure (`go list -deps`, `python -X importtime`, a bundle analysis, the Maven or
   Gradle tree) and cite the import that pulls it.
6. The published manifest carries references that resolve only in the author's workspace, or
   misclassifies scope: `replace` directives, `file:`, `link:` or `path =` dependencies, a dev
   or test dependency declared at runtime scope, an exact pin where the ecosystem resolves
   ranges (Python, npm, Maven). **Major**. Read the manifest diff and the resolver's tree.
7. The packaging include list disagrees with the tree: a module the entry imports is absent
   from `packages`, `files`, `MANIFEST.in` or the build config, or tests and fixtures ship.
   **Major** when the install is broken; **Minor** for shipped tests. Build the artifact into a
   scratch directory and list its contents against the import graph.

### False positives (library)

- Deep paths the library documents as public subpath exports (`lib/adapter-x`, an `exports`
  entry, a separately published module).
- Adapter glue that looks generic but needs the framework's lifecycle (request scope, filter
  chain order) to run.
- Generated code committed with a CI step that regenerates and fails on drift.
- A private symbol used by the library's own tests through the language's test-only bridge.
- Go module requirements are minimums, not pins; an exact version in `go.mod` is normal.
