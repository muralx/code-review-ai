### Library specifics for coding-practices

Library code runs inside someone else's process, thread, logging and lifecycle; every decision
it makes for itself it makes for every consumer, and the consumer cannot patch it.

### Always check (library)

1. The library terminates or aborts the host: `os.Exit`, `log.Fatal`, `sys.exit`,
   `process.exit`, `System.exit`, or a `panic`, uncaught exception or assertion failure on data
   the caller passed rather than on a programmer error at construction. **Critical** for a
   process exit; **Major** for a panic on data. Grep for the exit calls; read every `panic`,
   `raise` and `throw` reachable from an exported function with caller data.
2. Output goes anywhere except an injected or configurable logger: `fmt.Print*`, `print(`,
   `console.*`, `System.out`/`err`, a root-logger `basicConfig`, a handler added to the root
   logger, a global log level set. **Major** when the library configures global logging (it
   hijacks the host's); **Minor** for a stray print. Grep the non-test files.
3. Import-time or init-time side effects on process state the package does not own: replacing
   a default HTTP client or transport, registering signal handlers, setting environment
   variables or locale, altering warning filters, a global serializer setting, a background
   thread started at import. **Major**; **Critical** when it changes TLS or crypto defaults.
   Read every `init()`, module-level statement and static initializer in the diff.
4. An exported blocking operation gives the caller no cancellation or deadline: no context,
   cancellation token or abort signal parameter, an internal hard-coded timeout the caller
   cannot override, or a timeout option read but not applied on every path. **Major**. List
   exported functions that do I/O or wait; name the parameter that bounds each.
5. An error a caller must act on is not distinguishable by type or sentinel: a plain formatted
   string, a generic exception with only a message, one type for "input invalid", "upstream
   unavailable" and "not found". **Major** when the conditions need different handling (retry
   versus reject); **Minor** otherwise. List error-producing paths in the diff and the
   exported type each returns.
6. Resource ownership is ambiguous: the library closes a reader, connection or client the
   caller passed in, or opens one and exposes no `Close`, `dispose` or context-manager form, or
   needs a cleanup call its doc comment does not mention. **Major**. For each closable
   parameter, read whether the library closes it; for each constructor that opens something,
   name its release.
7. A sibling clone of this library in another language is mounted for the review and the same
   operation differs in semantics: a different default, a different error name for the same
   condition, a different edge-case result. **Major**. The divergence is the bug even when the
   local side reads correctly; verify against the sibling, then cite only this tree and the
   specification, and propose the additive form (new option, function or overload) over a
   changed signature.

### False positives (library)

- A panic, throw or assertion at construction on invalid programmer-supplied configuration (a
  constant, a `Must*` variant) is correct fail-fast, not termination on data.
- A library whose purpose is logging, process management or signal handling: the global it
  touches is the feature; likewise import-time registration into the package's own registry.
- A debug or trace line emitted through the injected logger at a level the host controls.
