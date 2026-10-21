### Go specifics for coding-practices

Errors are values, goroutines are cheap to start and easy to leak, and nil has several shapes; most Go defects sit in the path that ignored one of these.

### Always check (go)

1. An error is wrapped with `%v` or a bare string where it is forwarded, so `errors.Is`/`errors.As` cannot see the cause, or an error is matched by `err.Error() ==`/`strings.Contains(err.Error(), ...)`. **Major**. Grep the diff for `fmt.Errorf(` without `%w` on returned errors and for string matching on `err.Error()`; `go vet ./...` catches `%w` misuse (`printf`) and wrong `errors.As` targets (`errorsas`), missing `%w` you read for.
2. A function that blocks or does I/O takes no `context.Context`, takes it other than first, or creates `context.Background()`/`context.TODO()` mid-chain instead of propagating the caller's. **Major**. Trace each new blocking call to the context it uses; a fresh Background below a request handler is the finding.
3. A goroutine is started with no termination path: no context, done channel or `WaitGroup`, a send on a channel nobody may read, `time.After` in a loop. **Major**. For every `go` statement in the diff name what stops it; run `go test -race ./...` and the tree's `goleak` tests when present.
4. `defer` inside a loop body (`Close`, `Unlock`, `Rows.Close`) runs only at function return, holding every handle until then. **Major** for files, locks and connections; **Minor** for cheap handles. Read each `for` in the diff for a `defer` not inside a closure or helper.
5. Writing to a nil map, `append` into a slice that aliases another's backing array, or a typed nil pointer returned as an interface so `err != nil` is true. **Major**. `go vet` does not catch these; read every `var m map`, shared `append` and interface-typed return, and demonstrate with a throwaway `_test.go` outside the tree.
6. `err` redeclared with `:=` in an inner scope (`if`, loop, closure) so the outer check sees a stale value. **Major**. Run the `shadow` analyzer (`go vet -vettool=$(which shadow) ./...`) or golangci-lint's `govet` with `shadow` enabled when available; otherwise read every nested `err :=`.
7. `int`/`int64`/`uint` conversions or arithmetic on sizes, offsets, timestamps or money that can wrap (`int(u64)`, `len(a)*size`, `int32(n)`), with no range check. **Major** when the value reaches an index, allocation or amount. Compute the source range; `gosec` (G115) or `staticcheck` when available.
8. A `sync.Mutex`/`sync.WaitGroup` copied by value (struct passed or ranged by value), or `wg.Add` called inside the goroutine it counts. **Major**. `go vet ./...` (`copylocks`) reports the first; read the second.
9. `go vet ./...`, `go build ./...` and `go test -race ./...` were not run on the change. **Major** on your own output: run them and cite the commands and results, or set `verified: false` and say why.

### Idioms a reviewer should expect

- Errors returned, not panicked; `panic` only in `init` or `Must*` constructors for programmer mistakes.
- `errors.Is`/`errors.As` over type switches on concrete errors; sentinels exported as `ErrX`.
- Accept interfaces, return structs; interfaces of one to three methods.
- Usable zero values: no constructor for a struct whose zero state is valid.
- `defer mu.Unlock()` on the line after `mu.Lock()`; no I/O under a lock.
- `ctx context.Context` first, never stored in a struct; early return instead of `else` after an error check.
- Short consistent receiver names, never `this` or `self`.

### False positives (go)

- An error explicitly discarded (`_ = f.Close()` on a read-only file, a commented best-effort cleanup); the general rule already allows it.
- `context.Background()` at a true root: `main`, a test, a process-lifetime worker started once and documented as such.
- `%v` on an error that is only logged or shown to a human and never returned.
- A conversion to `int` of a value already bounded by `len()` of a slice; it cannot overflow on supported platforms.
- A goroutine whose lifetime is the server's, started from `main` with the server's shutdown as its stop.
