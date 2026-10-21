### What to read first

- Entry points in the diff: new or changed routes, handlers, CLI arguments, message consumers,
  file readers, anything that parses bytes it did not produce.
- The sinks those entry points reach: queries, process execution, template rendering,
  filesystem paths, outbound requests, deserializers. Trace input to sink before judging
  either end.
- The tree's existing auth layer (middleware, guards, decorators, router registration), so you
  know what "protected" looks like here and can spot a handler that skipped it.
- Dependency manifests and lockfiles in the diff: every new package is code you have not read.
- Config and environment loading, logging setup and error serialisation: where secrets enter
  and where data leaves.

### Always check

1. Input from outside the trust boundary (request bodies, headers, query strings, file names,
   message payloads, caller-controlled environment) reaches logic with no check on type,
   length, range or format. **Major**. For each new or changed entry point, follow every
   parameter to its first use and name the validation that sits between.
2. Untrusted data is concatenated or interpolated into a query, shell command, template,
   regular expression, format string or filesystem path. **Critical**. Grep the diff for
   string building near exec, query, render, open and path-join calls; confirm parameters,
   allow-lists or canonicalisation are used instead. For paths, confirm the resolved path is
   checked against the intended root after symlink resolution: a lexical join, clean or
   normalise call does not prevent traversal, and a prefix check before realpath is bypassed by
   a symlink. For process execution without a shell, an argument that starts with `-` is still a
   flag to the child (`--upload-pack`, `-exec`, `-o`); the fix is a `--` separator or rejecting
   such values.
3. A new or re-wired route, handler, RPC method or job entry has no authentication or
   authorization, or checks identity but not the caller's right to the resource addressed.
   **Critical** when it exposes data or mutation; **Major** on an internal-only surface. List
   every handler the diff adds or re-registers and name the guard covering each; an id taken
   from the request must be checked against the caller's permissions, not just for existence.
   Compare the new handler with its siblings in the tree and in the same diff: an ownership,
   tenant or visibility check a sibling performs and the new one omits, a route whose tenant
   path parameter the handler never reads, a gate that is enforced only when its parameter is
   present, is the finding. Ask of every endpoint that accepts a resource id: if user A sends
   user B's id, what stops them?
4. A credential, token, private key or signing secret appears in source, committed config,
   test fixtures, log statements, error messages or URLs. **Critical** in source or logs;
   **Major** in fixtures that look real. Grep for key-like literals and for logging of whole
   request, header or config objects, and for exception text, tracebacks or upstream response
   objects serialised into a response or log (client libraries embed the authorization header
   in them). A bearer token in a query string is a leak into every access log. Report location
   and kind; never quote the value.
5. Randomness for tokens, session ids, nonces or salts comes from a non-cryptographic
   generator; a weak or deprecated algorithm or mode is chosen for a security purpose; keys
   are hard-coded, reused across purposes or compared with a non-constant-time equality; a
   token that gates access carries fewer than 128 bits of entropy (64 for an id that must only
   resist guessing); a password is hashed with a general-purpose digest instead of a password
   hash. **Critical** for generator and algorithm; **Major** for key handling and entropy. Read
   every call into a crypto library in the diff and the import that supplies its random source;
   compute the entropy from the generator call and the encoding.
6. Untrusted bytes are deserialized with a format or library that can instantiate arbitrary
   types, or with no schema and no size limit. **Critical** for arbitrary types; **Major** for
   missing limits. Find each decode call fed by external input and check what it may produce
   and how large the input may be.
7. An outbound request uses a URL, host or port derived from untrusted input without an
   allow-list, scheme restriction and redirect policy, or can reach loopback, link-local or
   private ranges. **Major**; **Critical** if credentials or instance metadata are reachable.
   Trace the destination of every new HTTP, DNS or socket call back to its origin, including
   configuration the attacker may have written earlier (discovery documents, webhooks, project
   files). A scheme or format validator is not a defence: the check must reject the forbidden
   ranges after resolving every address, on every redirect hop, comparing the parsed hostname
   rather than a string prefix or suffix (`trusted.example@evil.example`, `//evil.example`, a
   trailing dot, mixed case all pass a string check).
8. A check and the action it protects are separated in time or across processes: exists then
   open, permission lookup then write, balance read then debit, with no lock, transaction or
   atomic primitive between them. **Major**. Read the sequence and name the interleaving that
   bypasses the check; a race without a security consequence belongs to coding-practices.
9. The diff adds a third-party dependency or crosses a major version. Inspect, do not
   auto-flag: what the package does, its maintenance state, transitive surface, whether the
   lockfile pins it, install hooks, and whether the standard library or an existing dependency
   already covers the need. **Major** only with a concrete concern: unmaintained, a known
   advisory, a look-alike name, install-time scripts, or far more capability than the use.
10. Error responses or exception handlers return stack traces, internal paths, query text,
    hostnames or dependency versions to callers outside the boundary. **Minor**; **Major**
    when the output includes another user's data. Read every new error path that serialises to
    a response and what it carries.
11. A security control is removed, loosened or made configurable (origin allow-list widened,
    TLS verification disabled, rate limit raised, cookie flags dropped, permissive default
    added) with no reason stated in the change. **Major**. Diff middleware and config;
    "temporary" is not a reason.
12. An allow-list or deny-list is matched by substring, unanchored prefix or suffix, or against
    the raw rather than the parsed and normalised value; or a validator added to one field in
    the diff is missing on a sibling field of the same role that reaches the same sink.
    **Major**; **Critical** when it guards data or a mutation. Read the comparison; try the
    bypasses: a path containing the allowed prefix after `..`, `localhost` beside `127.0.0.1`,
    `javascript:` in mixed case, `trusted.example.evil.example` against a suffix check.

### Common false positives

- Values the system produced itself, operator-deployed config, or a struct already validated
  at the edge and passed between internal layers are not an untrusted boundary. Establish the
  origin before calling input unvalidated.
- A parameterised query or ORM call with a dynamic *value* is not injection; only a dynamic
  identifier, table name, sort column or raw fragment is.
- A handler without its own auth check is fine when router-level middleware already covers the
  path; read the registration, not only the handler body.
- Obviously fake secrets in tests and local examples (`test-secret`, all-zero keys, tokens for
  `example.com`) are not leaks. Flag material that looks real or is loaded on a production path.
- MD5 or SHA-1 used for a non-security purpose (cache keys, content checksums, bucketing) is
  not a crypto finding.
- A well-maintained dependency with a narrow use is not a finding; file nothing rather than
  "please review this dependency".
- Environment variables and command-line flags are trusted input unless the program is itself a
  privilege boundary (a setuid binary, a sandbox, an agent runner); an attack that needs to set
  them is not a finding.
- Random UUIDs need no guessing defence; `../` in a path that only selects a route is not
  traversal (only a file read is); logging a URL is ordinary, logging request headers is not.
- A crash on a missing or null value is a defect for **coding-practices**, not a vulnerability;
  a missing permission check in browser code is not a finding when the server enforces it.
- A security library imported at the right layer, a framework that escapes by default, and a
  parameterised query need no further proof; the finding is the explicit bypass.

### What this type does not cover

Whether the hostile cases have tests belongs to **testing**; ordinary correctness and idiom belong to **coding-practices**.
