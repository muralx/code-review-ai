### Go specifics for performance

Go's cost is mostly allocation: what escapes to the heap is paid for again at collection time,
goroutines are cheap enough to be spawned per item by accident, and the toolchain measures all
of it, so no Go performance finding needs to rest on a guess.

### Always check (go)

1. An allocation per iteration on a hot path: a value escaping through a returned pointer, an
   interface conversion or a closure capture; a `[]byte` to `string` conversion per element;
   `fmt.Sprintf` for a plain concatenation; a large buffer allocated per call where the tree
   already pools (`sync.Pool`). **Major** on a request or ingest path; **Minor** elsewhere. Run
   `go build -gcflags=-m ./pkg/...` and cite the escape line; `-benchmem` gives `allocs/op`.
2. `defer` inside a hot loop body: each deferred call is queued until the function returns, so
   cost and held handles grow with `n`. **Minor**; **Major** when the handle is a file, lock or
   connection, where the leak itself belongs to **coding-practices**. Benchmark the loop
   against a direct call and cite the difference.
3. A map or slice grown from zero when its size is known: `make(map[K]V)` then `n` inserts,
   `var s []T` then `n` appends. **Minor**; **Major** with a benchmark on a hot path.
   `-benchmem` shows the extra `allocs/op` from rehashing and regrowth.
4. A goroutine per element of a user-sized input where a worker pool, a semaphore channel or
   `errgroup` with a limit would do: each goroutine costs a stack and scheduler time. **Major**.
   Run the path under a benchmark and read the goroutine profile's peak count; cite it against
   `n`. Whether the fan-out is bounded at all belongs to **system-design**.
5. Garbage-collector pressure from the change: `runtime.mallocgc` and the background mark
   workers at the top of the CPU profile. **Major** with the profile. Run
   `go test -bench . -cpuprofile cpu.out` then `go tool pprof -top`, or the binary under load
   with `GODEBUG=gctrace=1`, and cite GC share or frequency before and after.
6. `regexp.MustCompile`, template parsing or a schema build inside a function invoked per
   request or per item. **Major** on a request path. Grep the diff for these calls below
   package level.
7. The package's `Benchmark*` functions were not run, or a number in the description has no
   comparison. **Major** on your own output when not run. Run
   `go test -run '^$' -bench . -benchmem -count=6 ./pkg/...` on base and head and compare with
   `benchstat` when the tree has it; cite the delta, or set `verified: false`.

### Idioms a reviewer should expect

- `strings.Builder` or a preallocated `[]byte` in string-building loops; `make([]T, 0, n)` and
  `make(map[K]V, n)` when `n` is known.
- Regexes and templates compiled at package level, once; `sync.Pool` for large transient buffers.
- `errgroup` with `SetLimit`, or a semaphore channel, for fan-out whose size comes from input.
- Streaming through `io.Reader` and `io.Writer` over `io.ReadAll` on bodies of unknown size.
- Large structs passed by pointer, small ones by value; no interface boxing in the innermost loop.

### False positives (go)

- A variable that looks heap-bound but `-gcflags=-m` reports as staying on the stack.
- A `defer` in a loop that runs a bounded handful of times.
- An allocation per request whose `allocs/op` and `B/op` are small against the request's other
  work; a count of allocation sites is not a finding without the numbers.
- `fmt.Sprintf` on an error path, or in a log call at a level disabled in production.
