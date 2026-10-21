### Website specifics for coding-practices

Everything the browser knows arrives over the wire and every response is a claim; the runtime is
single-threaded and every mounted component can leak. Most website defects are a trusted
response, a hand-rolled fetch lifecycle, or a request state nobody rendered.

### Always check (website)

1. A response, stored value or message payload is cast to its declared type (`as Dto`, a generic
   `fetch<T>`) with no runtime parse at the adapter edge, or parsed in one component so other
   callers skip it. **Major**; **Critical** when the unparsed value reaches money or a permission
   decision. Find the parse between each raw body and its first typed use; grep `as ` by `.json()`.
2. Request or response types are hand-written where the tree generates them from the API
   contract, or a generated types file is edited by hand. **Major**: the shape drifts from the
   backend and the next regeneration reverts the edit. Locate the generator script and its output
   path; a type mirroring an endpoint outside that file, or a hunk inside it, is the finding.
3. An effect fetches or subscribes without a lifecycle: no abort or stale-result guard on unmount
   or parameter change (a slow earlier response overwrites a newer one), no cleanup returned for a
   listener, observer, interval or subscription, or the result copied into state the tree's query
   layer already caches. **Major** for the race and the leak; **Minor** when only caching is lost.
   Read every new effect that awaits or subscribes; name its cleanup; mount twice, count handlers.
4. A `!` assertion or cast silences the `T | undefined` the compiler produces for indexed access
   or `.find(` under `noUncheckedIndexedAccess`, with no branch for the empty case. **Major** when
   the value reaches rendering or a request. Grep the diff for `]!` and `)!`; try the empty input.
5. Money or quantities are floats in arithmetic or comparison where the contract carries minor
   units or decimal strings, or `toFixed` rounds a computed amount before display or submit.
   **Major** when it reaches a shown total or a submitted value. Trace the field from the DTO to
   the arithmetic; run the expression with `0.1 + 0.2`-shaped inputs in `node -e`.
6. The UI branches on an error's message text, or on the HTTP status alone where the API returns
   a machine-readable code, or collapses every failure into one branch so a conflict, an expired
   session and a validation error get the same treatment. **Major** when a distinguishable error
   is mistreated. Grep `.message ===` and `.includes(` on errors; read the wrapper's error type.
7. A URL is assembled by concatenation from user or server data: a path segment not passed
   through `encodeURIComponent`, query parameters joined by hand, a base URL concatenated without
   handling its trailing slash. **Major**: an id containing `/`, `?`, `#` or a space changes the
   route or breaks the call. Each interpolated segment needs an encoder or a `URL` builder.
8. A request-state union is not handled exhaustively: data read under the pending state, no error
   branch, no empty state, a submit not disabled while the mutation is in flight so a second click
   sends twice. **Major** for double submit and a crash on empty; **Minor** for a missing empty
   state. For every new hook consumer find the branch for pending, error, empty and success.

### False positives (website)

- A cast on the line after a schema parse, or a generated client that validates responses itself;
  read the generator's output before filing.
- A hand-written type for a payload no contract describes (a third-party widget's message, a
  stored record) when it is parsed at the edge.
- An effect that syncs a non-network concern (document title, scroll, focus) is not fetching.
- Floats in display-only ratios (a progress bar, a chart axis) that never feed an amount, and
  branching on the HTTP status where the API defines no code field; read the error contract.
