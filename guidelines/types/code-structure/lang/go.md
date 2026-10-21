### Go specifics for code-structure

The package is Go's unit of API, visibility and import: a wrong boundary becomes a cycle the compiler rejects or an export the module's users depend on for good.

### Always check (go)

1. An import cycle introduced, or dodged with a new package whose only job is to break one (`types`, `common`, `shared`, `model` holding unrelated types). **Major**. Run `go build ./...` (cycles fail the build) and `go list -deps ./<pkg>` to confirm the edge; a cohesionless break-the-cycle package is the finding even when the build passes.
2. Code not meant as API placed outside `internal/` in a library module, or a `main` package's helpers exported from a non-internal path. **Major** for a library module (any importer can now depend on it); **Minor** in a service. Read `go.mod` for the module path and `go list -f '{{.ImportPath}}' ./...` for what is reachable.
3. New exported identifiers or struct fields with no caller outside the package. **Minor**; **Major** in a library module, where removing them later is a breaking change. Grep each new capitalised name across the module and any sibling modules mounted for review; `staticcheck` (`U1000`) when available reports unused unexported names, not this.
4. An interface exported from the producer beside its only implementation (`type Storer interface` next to `type PostgresStore`) rather than declared at the consumer that needs it. **Minor**. A one- or two-method interface owned by the caller is the idiom; a producer interface mirroring every method of the struct is the finding.
5. A package named `util`, `utils`, `helpers`, `common`, `misc` or `base`; a name repeated in its identifiers (`config.ConfigLoader`, `user.UserService`); or underscores, mixed case or a plural where siblings are singular. **Minor**. Read `package` clauses and import paths; `revive` reports stutter when configured, `go vet` does not.
6. Layout against the tree: a `main` package outside `cmd/<name>/`, a `pkg/` directory added where none exists, test-only helpers in a non-`_test.go` file of a production package instead of `internal/testutil` or `export_test.go`. **Minor**. Name where the tree already keeps each kind.
7. A file or function far beyond the package norm: a file over roughly 1000 lines or a function over roughly 100 in a package whose others are a fraction of that, or a complexity score (`gocyclo`, `gocognit` when configured) far above the package median. **Minor**; **Major** when branches cannot be exercised separately. Cite `wc -l` and the linter's number.
8. `init()` functions or package-level `var` initialisers that create cross-package ordering dependencies, or committed `//go:generate` output whose generator is not reachable from the tree. **Minor**; **Major** when init order changes behaviour. Grep `func init()` and `//go:generate`.

### Idioms a reviewer should expect

- `cmd/<binary>/main.go` kept thin (flags, wiring, exit code); logic in `internal/`.
- One package per concept, named for what it provides (`postgres`, `httpapi`, `token`), lowercase, no underscores.
- Files named by content (`server.go`, `handlers.go`), not by layer (`impl.go`, `interfaces.go`).
- `New`/`NewX` constructors returning the concrete type; functional options or a config struct when there are several knobs.
- `doc.go` in larger packages; every exported name has a doc comment beginning with its name.
- Generated code in its own file with the `// Code generated ... DO NOT EDIT.` header and excluded from lint.
- No `replace` directives in a library's committed `go.mod`; modules split only at genuine release boundaries.

### False positives (go)

- An exported name used by a sibling module mounted for review, by `go:generate` tooling, or required by reflection-based encoders and ORMs (exported struct fields with tags).
- A producer-side interface that is the module's documented extension point (drivers, plugins) with more than one implementation.
- A long file that is a generated artifact, lookup table or protocol constant set.
- `pkg/` or a flat layout when the tree already follows it consistently; match the tree.
- A shared `internal/testutil` package used by several packages' tests; that is where helpers belong.
