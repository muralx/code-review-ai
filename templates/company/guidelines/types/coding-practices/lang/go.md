### Go idioms (company additions)

- Every function that can fail returns an `error` as its last value; wrap with `%w` and the
  operation name, never with `%v` or a bare `errors.New` of the original text. **Major**.
- Every outbound call takes a `context.Context` as its first parameter and honours its
  deadline; a `context.Background()` inside a request path is the finding. **Major**.
- Goroutines started in a request path are tied to the request context or an `errgroup`; a bare
  `go func()` with no cancellation path or wait is the finding. **Major**.
- Package-level mutable variables other than `sync.Once`-guarded singletons are not allowed in
  non-`main` packages. **Minor**; **Major** when written after init.
- Run `go vet ./...` and the repository's `golangci-lint` configuration on the changed packages;
  cite the output rather than restating a rule by hand. **Minor** for a new warning.
