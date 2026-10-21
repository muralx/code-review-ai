### Go specifics for documentation

GoDoc is rendered from comments by `go doc` and the module index without a build step, so the
conventions are mechanical: the comment above the declaration is the reference, examples are
tests, and deprecation is a paragraph tooling can parse.

### Always check (go)

1. An exported symbol's doc comment does not begin with the symbol's name as a sentence, or an
   exported symbol in a published package has none. **Minor**; **Major** when the package is
   the module's documented entry point. Run `revive` (`exported`) or `golint` when the tree
   has one; otherwise grep each `^func |^type |^var |^const ` with a capitalised name for the
   `//` line above it.
2. A package has no package comment (`// Package name ...` in `doc.go` or one of its files),
   or has several that disagree. **Minor**; **Major** when the package is the import path a
   README points at. `go doc ./path` shows what renders.
3. An `Example*` function does not compile, refers to an identifier that does not exist (so
   `go vet` reports it), or carries an `// Output:` comment that no longer matches. **Major**
   when the README or package doc shows it; **Minor** otherwise. Run `go vet ./...` and
   `go test -run 'Example' ./...`; cite the output.
4. A deprecated symbol lacks a `// Deprecated: ...` paragraph of its own, or the paragraph
   names no replacement, or the changelog deprecates a symbol whose comment still presents it
   as current. **Minor**; **Major** when the replacement does not exist. `staticcheck`
   (SA1019) and editors read this paragraph; a malformed one is invisible to them.
5. Doc comment formatting breaks rendering: a line indented so it becomes a code block, a list
   or heading in the pre-1.19 form, a `[Name]` doc link to an identifier that does not
   resolve. **Nit**. Run `gofmt -d` on the file (it rewrites doc comments) and `go doc -all`.
6. The README import path differs from the `module` line in `go.mod`, or a README snippet uses
   an API the current version does not export. **Major**. Build the snippet in a scratch
   module with a `replace` directive pointing at the tree.
7. A function returns sentinel errors the package exports (`ErrX`) or wraps a documented
   error, and its comment does not say which, while callers in the tree branch on them.
   **Minor**. Grep the callers for `errors.Is(err, pkg.Err`.

### Idioms a reviewer should expect

- `// Package name ...` once per package, in `doc.go` when the package has several files.
- Comments as full sentences starting with the name: `// Dial opens ...`, `// ErrClosed is ...`.
- `// Deprecated: use Y instead.` as its own paragraph, after the description.
- `ExampleT`, `ExampleT_Method`, `ExampleT_Method_suffix` in `_test.go` with `// Output:` or
  `// Unordered output:`; an example without one compiles but does not run.
- Go 1.19 doc syntax: `# Heading`, `[Name]` links, indented code blocks, `- item` lists.
- Contracts stated in the comment: nil-safety, concurrency safety, zero value, errors returned.

### False positives (go)

- Unexported symbols, and exported symbols inside `internal/`, without doc comments.
- An example without `// Output:` whose output is nondeterministic; `go vet` still compiles it.
- The older `// A Foo represents ...` opening in a tree that uses it consistently.
- Package comments on `main` packages that describe the command rather than the package.
