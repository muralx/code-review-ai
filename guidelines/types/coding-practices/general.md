### What to read first

- The diff, then every function it touches in full. The bug is usually in the branch the
  diff did not change.
- The callers of each changed function (grep the name) to learn which inputs, errors and
  absent values they already pass or expect.
- The project's own lint, type-check and race or sanitiser configuration, so you can run the
  project's checks on a suspect line instead of arguing about it.
- Existing tests for the touched code. Run them before you assert anything about behaviour.
- The language amendment for this review, which names the idioms that make a check concrete.

### Always check

1. An error is dropped, overwritten, or returned without the context a caller needs to act on
   it. **Major**. Trace every error-producing call in the diff to where it is handled; a path
   that logs and continues as if it succeeded, or returns a zero value on failure, is the
   finding. Cite the call and the handler in `evidence`.
2. A resource is acquired without a guaranteed release on every exit path: file, socket,
   lock, transaction, goroutine or task, subscription, temp file. **Major**. For each
   acquisition name the release and list the exits that skip it (early return, exception,
   panic, cancellation); confirm by reading, and by running a test under the failure path when
   one exists.
3. A blocking call has no timeout or cancellation: outbound requests, queue reads, lock waits,
   subprocess waits. **Major**. Read the call site and the client configuration it inherits; a
   library default of "wait forever" counts, a deadline inherited from the caller's context
   does not.
4. Shared mutable state is read or written from more than one thread, task or goroutine
   without a lock, atomic, channel or ownership rule. **Major**. List every writer of the
   field; if any runs concurrently with a reader, run the race detector or sanitiser the
   toolchain offers and cite its output, or state that it is unavailable.
5. A value that can be null, nil, undefined or absent crosses a boundary (deserialisation,
   map lookup, optional field, external API, environment) and is dereferenced without a
   check. **Major**. Follow the value from where it enters; the producer's contract (schema,
   signature, documentation) decides whether absence is possible.
6. An index, slice, range or loop bound is off by one or unchecked against the container's
   length. **Major**. Evaluate the boundary cases by hand (empty, one element, exactly the
   limit) and run a test that exercises them; write a throwaway one outside the source tree
   if none exists.
7. A standard-library or well-known API is used against its contract: wrong argument order,
   ignored return value, deprecated or unsafe variant, misuse of comparison, time zone,
   encoding or path functions. **Major** when results are wrong; **Minor** otherwise. Read
   the API's documentation or source in the module cache, not your memory.
8. A catch, recover or except block swallows the failure: empty body, log-only without
   rethrow or return, a broad base type that hides unrelated errors, a fallback to a default,
   stub or cached value that presents the failure as success, optional chaining that skips a
   failing step. **Major** when the operation's result is used afterwards; **Critical** when
   production code falls back to a mock or stub; **Minor** when it only loses diagnostics. For
   each handler in the diff list the errors it can hide and state what the caller sees.
9. A literal number, string, duration or status code carries meaning without a name.
   **Minor**. Grep for the same literal elsewhere in the tree; two unexplained copies is the
   finding, one self-explanatory literal is not.
10. Dead code or debug leftovers: unreachable branches, unused parameters or imports,
    commented-out blocks, print statements, hard-coded test flags, markers that disable
    behaviour. **Minor**; **Major** when a leftover alters production behaviour (a skipped
    check, a forced flag). Run the compiler, linter or unused-symbol check and cite the output.
11. A retried or re-entered operation is not idempotent: a retry loop repeats a non-idempotent
    write, or a handler can run twice on the same input. **Major**. Read the retry wrapper and
    what it wraps; name the duplicated side effect.
12. Integer overflow, float equality, or lossy numeric conversion on a value that reaches a
    decision. **Major** when it reaches money, time, size or an index; **Minor** otherwise.
    Compute the range the value can take from its source and cite it.
13. Removed code carried behaviour nothing re-establishes: a guard, a re-check after a call that
    can invalidate a handle, a special case for one member of a fixed set; or the diff handles
    some members of an enum, status set or flag set and leaves the rest to an unchanged branch
    that no longer fits them. **Major**. For each removed hunk state what it did and where that
    now happens; for each new case list the members not handled and read the branch they fall
    into. Check every changed call site, tests included, against the callee's current
    declaration (argument count, order, types, defaults).

### Common false positives

- An error discarded explicitly, with a comment or a visible project convention, at a site
  where failure is harmless (best-effort cleanup, metrics, logging).
- Shared state that only looks concurrent: single-threaded event loops, immutable after
  construction, per-request objects. Confirm the ownership before raising.
- A missing nil check on a value the language, framework or constructor guarantees non-null.
  Read the producer, then decide.
- A literal that explains itself in context (0, 1, a percentage base, an HTTP status next to
  its symbolic name).
- A blocking call without its own timeout inside a scope that already carries a deadline
  (request context, cancellation token, worker shutdown).
- Idiom that differs from your preference but matches the established style of this tree.
  Match the tree, not your taste; the language amendment names what counts as idiom.

### What this type does not cover

Where code lives, how it is named across the tree, and duplication belong to code-structure.
