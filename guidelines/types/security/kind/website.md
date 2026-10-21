### Website specifics for security

The attacker holds a browser, not a shell: everything the server sends is executed, every
cookie is sent back automatically, and anything in the bundle is public.

### Always check (website)

1. Untrusted data reaches the DOM or a template without context-appropriate encoding: raw HTML
   assignment, an escape bypass, input placed in `href` or `src`, user content in inline scripts.
   **Critical**. Grep the diff for raw-HTML sinks and bypasses; trace each value to its origin.
2. The Content-Security-Policy is absent on a new page, weakened (`unsafe-inline`,
   `unsafe-eval`, a wildcard source), or uses a predictable or reused nonce. **Major**;
   **Critical** when the change also adds a sink from check 1. Compare with a sibling page.
3. A state-changing request has no CSRF defence (no token, no `SameSite`, a mutating GET), or a
   session or auth cookie lacks `Secure`, `HttpOnly` or `SameSite`. **Critical** for an
   authenticated mutation; **Major** for cookie flags. Read every cookie set in the diff.
4. A redirect or return URL comes from a parameter, header or body with no allow-list or
   same-origin check, or the check passes protocol-relative, backslash or encoded forms.
   **Major**; **Critical** when it carries a token or code. Test `//evil.example` and `/\evil`.
5. CORS reflects the request origin, allows credentials with a wildcard or broad pattern, or
   exposes an authenticated API to any origin. **Critical** with credentials; **Major**
   otherwise. Read the origin matcher; an unanchored regex is the evidence.
6. A secret is in the client bundle (server token, signing secret under the public variable
   prefix, published source map), or the build pulls unpinned or unverified code (no enforced
   lockfile, install scripts, a script tag without `integrity`). **Critical** for a secret or a
   known advisory; **Major** otherwise. Grep the build output; read the lockfile diff.
7. A bearer, access, refresh or session token is written to `localStorage`, `sessionStorage`,
   IndexedDB or the Cache API, where any injected script can read it. **Critical**. Grep the diff
   for storage writes and trace each value to its origin; a cookie the server sets `HttpOnly`, or
   a token held in module memory, is the expected form.
8. A request bypasses the tree's single client wrapper (a raw `fetch` or `XMLHttpRequest` in a
   feature, hook or route), so it loses the credentials mode, the CSRF header, error mapping and
   any re-authentication interceptor the wrapper carries. **Critical** for a mutation; **Major**
   for a read. Grep outside the wrapper module and the dev-only mock layer; name what each drops.
9. A browser telemetry exporter, analytics beacon or error reporter is configured with an
   authorization header or API key, or attaches request bodies, session identifiers or user
   identity to spans and reports. **Critical** for a credential (it ships to every client);
   **Major** for bodies or identifiers. Read the exporter options and the attribute setters.

### False positives (website)

- An engine that escapes by default is safe; only an explicit bypass (raw filter) is a sink.
- A `SameSite=Lax` session cookie already defends top-level cross-site POST; file a missing
  token only for what Lax does not cover (mutating GET, older clients).
- Values the framework exposes to the browser by design (public API base URL, build id) are
  configuration, not secrets; permissive CORS on a public, unauthenticated, read-only API is a
  product decision unless credentials are allowed.
- A one-shot, non-bearer value in `sessionStorage` (an OAuth `state` nonce, a PKCE verifier
  consumed on return, a UI preference) is not a stored credential; a publishable key the vendor
  designs for the browser is not a secret on an exporter.
