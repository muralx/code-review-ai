### Go specifics for security

The standard library offers safe primitives (placeholders, argument-list `exec`, `crypto/rand`, `html/template`) with unsafe neighbours one import away; the review is confirming which one the diff reached for, plus server defaults that are wrong out of the box.

### Always check (go)

1. SQL built with `fmt.Sprintf`, `+` or `strings.Builder` and passed to `Query`/`Exec`/`QueryRow`/`Prepare`, or to an ORM raw-fragment method (`Raw`, `Where("..."+x)`), instead of `?`/`$1` placeholders. **Critical**. Grep the diff for `Sprintf` or `+` on the line of a query call; `gosec` (G201, G202) when available.
2. `exec.Command("sh", "-c", s)` or `"bash", "-c"` with a non-constant `s`, or an argv whose program name comes from input. **Critical** for shell strings; **Major** for an untrusted argv[0]. Confirm `exec.Command(constName, args...)`; `gosec` G204 when available.
3. A path joined from untrusted input (`filepath.Join(root, p)`, `os.Open(dir+name)`) with no confinement: `filepath.Clean` then `filepath.Rel(root, p)` not beginning `..`, `filepath.IsLocal`, `os.OpenRoot` (Go 1.24+) or an `fs.FS`. **Critical**. `Join` does not stop traversal and `strings.HasPrefix(p, root)` without a trailing separator is bypassable; `gosec` G304 when available.
4. `math/rand` or `math/rand/v2` supplies a token, session id, nonce, salt, password or IV, or the error from `crypto/rand.Read` is dropped. **Critical**. `rand.` is ambiguous; read the import block of every file that uses it.
5. `tls.Config` with `InsecureSkipVerify: true`, `MinVersion` below `tls.VersionTLS12`, a hand-picked `CipherSuites` list, or a `VerifyPeerCertificate` that returns nil unconditionally. **Critical** for skip-verify on a non-test path; **Major** otherwise. Grep `tls.Config{`; `gosec` G402 when available.
6. `http.Server` or `http.ListenAndServe` with no `ReadHeaderTimeout`/`ReadTimeout`/`IdleTimeout`, or a handler decoding `r.Body` with no `http.MaxBytesReader`/`io.LimitReader`. **Major** (slowloris, memory exhaustion). Grep `http.Server{` and `ListenAndServe(`; `gosec` G112 when available.
7. `unsafe`, `//go:linkname`, cgo, or `reflect` driven by untrusted type or field names added to a package that parses external input. **Major**; **Critical** when it reinterprets attacker-controlled bytes. Grep imports; `go vet ./...` (`unsafeptr`) and read every use.
8. `go.mod`/`go.sum` changed and `govulncheck ./...` not run, or run and a reachable finding dismissed. **Major**; **Critical** when the vulnerable symbol sits on an input path. Run it when available (`go run golang.org/x/vuln/cmd/govulncheck@latest ./...`) and cite the IDs; it reports call-path reachability, so "not called" is valid only when the tool says so.
9. `text/template` rendering HTML, `template.HTML(input)`/`template.JS`/`template.URL` on untrusted data, or `fmt.Fprintf(w, "<...>", input)` around `html/template`. **Critical**. Grep the typed-string conversions and the `text/template` import in handler packages.

### Idioms a reviewer should expect

- `crypto/subtle.ConstantTimeCompare` for secrets, `hmac.Equal` for MACs.
- `QueryContext`/`ExecContext` with placeholders; named parameters when the tree uses `sqlx` or `pgx`.
- `http.Client{Timeout: ...}` on every outbound client rather than bare `http.DefaultClient`; `http.TimeoutHandler` or `context.WithTimeout` on handler budgets.
- `os.Root`/`fs.FS` to confine file access; `filepath.IsLocal` on untrusted relative paths.
- Secrets loaded once from env or a secret store into a struct and logged never; structured logging with explicit fields, not `%+v` of a config.
- `golang.org/x/crypto` (`argon2`, `bcrypt`) for passwords; salted SHA-256 is not a password hash.
- `json.Decoder` with `DisallowUnknownFields()` where strictness matters, validation before use.

### False positives (go)

- A query assembling identifiers from a fixed allow-list (constant column map, a `switch` on sort field) while values stay in placeholders.
- `math/rand` for jitter, backoff, sampling, shuffling or load spreading.
- `InsecureSkipVerify` in `_test.go` or behind a development-only flag whose default is false.
- `exec.Command` with a constant program and input only as positional arguments after `--` for a program that honours it.
- `filepath.Join` on paths from deployment config or an `embed.FS`; those are not an untrusted boundary.
