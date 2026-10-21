### Service specifics for security

The attacker holds a network client and the deployment's blast radius: any route the listener
exposes can be called directly, replayed, flooded or fed oversized input, and whatever the process
logs or returns is read by someone who was never meant to see it.

### Always check (service)

1. A route, sub-router, listener or consumer is mounted outside the middleware chain the tree's
   other entry points pass through, so authentication, body limits, recovery and request logging
   are skipped at once. **Critical** when the bypassed path mutates or returns data; **Major**
   otherwise. Read the server assembly and name the chain under each registration the diff adds.
2. A secret enters as a value (an environment variable or config field holding the bytes) rather
   than as a path or resource reference the loader resolves at startup, or the loaded config object
   is logged or dumped whole. **Major**; **Critical** when the dump reaches logs or a response. Grep
   config fields named for keys, passwords, tokens and secrets; read their type and the loader.
3. A new listener or body-reading handler has no request body cap, or the server lacks header,
   read, write and idle timeouts, so one slow or oversized client holds a connection or memory
   indefinitely. **Major**. Read the server constructor and the body-limit middleware; confirm the
   new path runs under both.
4. A log line, span attribute, metric label or boundary error log carries a credential (even
   truncated, prefixed or hashed without salt), a whole request, header map or body, or personal
   data where an identifier would do. **Critical** for a credential; **Major** otherwise. Grep the
   new telemetry calls and the boundary log; a wrapped error that embeds input is a leak too.
5. Caller identity, client address or tenant is taken from a header (forwarded-for, client
   certificate, internal-user) on a listener reachable without the proxy that sets it. **Critical**.
   Read where the header is consumed and the deploy manifest or ingress config for what terminates
   in front; without proof of termination the header is attacker-controlled.
6. A message consumer or job treats its payload as validated because only this tree's producer
   publishes, on a subject or queue other principals can write to. **Major**. Read the broker's ACL
   or topic ownership and name every principal that can publish; the payload crosses a trust
   boundary unless there is exactly one and it is this tree.
7. A rate limit, challenge or anti-abuse gate fails open when its store is unreachable on a write
   that creates accounts, sends messages or consumes quota, or runs after an account lookup whose
   response differs by existence. **Major**; **Critical** when the gated operation is a login.
   Read the limiter's fail policy per route and the order of gate and lookup.
8. A proxying or aggregating handler forwards the caller's credentials (authorization header,
   cookie) to an upstream, lets the caller supply a header the upstream trusts, or returns an
   upstream's authentication-failure body to the caller. **Critical** for forwarded credentials;
   **Major** otherwise. Read the header allow-list and deny-list in both directions.

### False positives (service)

- Health and readiness probes mounted outside the auth middleware are the orchestrator's contract;
  file only a probe body that lists hostnames, versions or dependency addresses, as **Minor**.
- A listener on a mesh or mTLS port whose manifest proves termination may trust the injected
  identity header; cite the manifest when you drop it.
- Secrets as environment values in a local compose file or a development profile; the production
  loader path is what counts.
- A stable opaque identifier (user id, order id, request id) in a log or span is not personal data.
