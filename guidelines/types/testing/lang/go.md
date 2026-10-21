### Go specifics for testing

Go tests are plain functions under `go test`; structure comes from table-driven subtests, parallelism from `t.Parallel`, and nothing stops a test passing with no assertion or racing on shared state unless you run it with `-race`.

### Always check (go)

1. The changed tests were not run with `go test -race -count=1 ./...`, plus `-run <Name> -count=10` or more for anything touching concurrency. **Major** on your own output: run it and report commands and counts; `-count=1` defeats the test cache, so a cached pass is not mistaken for a run.
2. `t.Parallel()` subtests share a map, slice, global, working directory, `os.Setenv` or a fixture mutated in place, or capture the loop variable under a `go.mod` `go` directive below 1.22. **Major**. Grep `t.Parallel()` in the diff and list what each subtest writes; `go vet` (`loopclosure`) covers the capture case on older toolchains.
3. Synchronisation by `time.Sleep`, or a timeout tuned to make a race rare rather than impossible. **Major**. Grep `time.Sleep(` in changed `_test.go` files; the fix is a channel, `WaitGroup`, context or fake clock, and your proof is `go test -race -count=20 -run <Name>`.
4. A helper that calls `t.Fatal`/`t.Error` without `t.Helper()`, so failures point at the helper, or a helper returning `error` that callers ignore. **Minor**. Grep for functions taking `*testing.T` or `testing.TB` in the diff.
5. HTTP handlers tested against a live listener or external URL instead of `net/http/httptest` (`NewRecorder`, `NewServer`), or an `httptest.Server` without `defer srv.Close()`. **Major** for live network; **Minor** for the missing `Close`.
6. Golden files under `testdata/` regenerated in the same diff with no account of the delta, or an `-update` flag that defaults on so the test rewrites its own expectation. **Major** when the golden change hides a behaviour change. Read the golden diff as production output; grep the flag's default.
7. A table-driven test with unnamed or duplicate cases, or rows that cannot fail (`want` computed by the code under test, zero `want` on every row). **Minor**; **Major** when it is the only coverage. Read each row against the behaviour list.
8. `reflect.DeepEqual` or `cmp.Diff` on structs with time, pointers or unexported fields without the matching `cmpopts`, errors compared with `==` instead of `errors.Is`, or a `cmp.Diff` result never checked. **Minor**; **Major** when the comparison always passes.
9. `assert` used where `require` is needed, so the test continues on a nil and panics instead of failing cleanly, or `testify` introduced into a stdlib-only package (or the reverse). **Minor**. Match the package's existing imports.

### Idioms a reviewer should expect

- `func TestX_Condition(t *testing.T)` with `t.Run(tc.name, ...)` over one function per case; `t.Parallel()` where safe.
- `testdata/` for fixtures; `t.TempDir()`, `t.Setenv`, `t.Cleanup` over hand-rolled equivalents.
- Internal tests in `package foo`, black-box tests in `package foo_test`, `export_test.go` to bridge them.
- `got`/`want` naming and `got X, want Y` messages; `if diff := cmp.Diff(want, got); diff != ""` when `go-cmp` is a dependency.
- `errors.Is(err, ErrX)`/`errors.As` in assertions; message text compared only in tests of the message.
- Hand-written fakes satisfying the consumer's small interface, unless the tree already uses `gomock` or `mockery`.
- `testing.Short()` guards or `//go:build integration` tags on tests that need external services.

### False positives (go)

- `time.Sleep` driving a fake clock, or a generous wait followed by a channel assertion on a ticker the code under test owns.
- A loop variable captured in a parallel subtest under `go 1.22` or later; per-iteration semantics make it safe.
- Read-only fixtures (a parsed `testdata` file, a constant table) shared across parallel subtests.
- Non-fatal `assert` in a table loop that intentionally reports every failing row before stopping.
- A test with no explicit assertion whose stated purpose is "does not panic" or a compile-time check such as `var _ Iface = (*T)(nil)`.
