### Library specifics for security

The host process is trusted and the data it hands over is not: a hostile caller can already do
anything the process can, but a token, document or key the host received from the network and
passed in unchanged is as untrusted as it was at the host's edge.

### Always check (library)

1. Caller-supplied data is parsed or validated with no bound on size, depth, count or
   repetition because "the host validated it": no maximum token or document length, unbounded
   recursion in a decoder, an unbounded header or claim list, a regular expression that
   backtracks on crafted input. **Major**; **Critical** when the unbounded path sits in a
   verification decision every consumer relies on. Feed a 10 MB input and a deeply nested one
   to each new parsing entry point and time it.
2. A secret the host passed in (key, token, password, client secret) is reachable through the
   type's stringer, debug formatter, `repr`, `toString`, JSON serialisation or a struct dump, or
   is quoted in an error or exception message. **Critical** in an error message or log line;
   **Major** for a stringer, since the host will log the struct. List every type that holds a
   secret and read its formatting methods; print one in a throwaway test outside the tree.
3. A security-relevant default is permissive: verification that defaults to off, an algorithm
   or scheme allow-list that is empty or includes weak members by default, unbounded clock
   skew, transport verification disabled by a default option. **Critical** when a zero-option
   construction accepts input it must reject; **Major** otherwise. Construct the client or
   verifier with no options and list what it checks.
4. An exported function skips a check without saying so in its name and doc comment: a
   `Parse` that does not verify beside a `Verify`, an option that disables a check under a
   neutral name (`lenient`, `fast`, `skipX`). **Major**; **Critical** when the unverified
   variant is the one the README example uses. List exported entry points that bypass a check
   and read their names and documentation.
5. Validation is stricter in a sibling clone of this library mounted for the review: the local
   side accepts an input the sibling rejects, or the reverse. **Major**; **Critical** when the
   input is a credential or a verification subject, since one consumer population is now the
   weak one. Run the same vectors against both; the finding cites this tree and the
   specification only, never the sibling.
6. A runtime dependency range is open-ended (`>=`, `*`, `latest`, a bare major) so every
   consumer installs whatever publishes next under that name. **Major**. Read the manifest's
   runtime section; a library ships ranges, not a lockfile, and the range is the only control.
7. The library writes to a global that changes the host's security posture: the default
   transport or TLS configuration, the process trust store, environment variables, the random
   source, a global loader or deserializer setting. **Critical**. Grep package-level and
   import-time writes to anything the package does not own.

### False positives (library)

- Invalid configuration from the host (nil logger, negative timeout, malformed option) is a
  programmer error; failing fast at construction is correct and needs no hardening.
- Reflection, private-field access, monkeypatching or a hostile caller in the same process: the
  library cannot defend against the process it runs in and is not asked to.
- Logging the shape of a secret (length, key id, algorithm, fingerprint) is not logging it.
- An unverified or insecure variant named as such, documented and absent from the quick start.
