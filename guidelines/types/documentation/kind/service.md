### Service specifics for documentation

A service's readers are the operator paged at night and the client integrating against its API;
neither reads the code first. The documents that matter are the runbook, the configuration
reference, the probe semantics and the API's error catalogue.

### Always check (service)

1. A new or changed configuration key, environment variable or flag is missing from the
   configuration reference, or the documented default, unit or requiredness differs from the
   loader. **Major** when the key is required for startup or changes security behaviour; **Minor**
   otherwise. List the keys from the config struct or loader; diff against the reference; start
   the service with the documented values.
2. Liveness and readiness semantics are undocumented or wrong: the doc says readiness checks a
   dependency the probe does not check, or describes liveness as depending on a dependency.
   **Major**: the on-call and the deploy manifest act on it. Read the probe handlers beside the
   doc; call the probe with a dependency down and compare.
3. A new dependency, background job, queue or failure mode has no runbook entry: the signal that
   fires, how to tell slow from down, how to drain, replay or restart. **Minor**; **Major** when a
   new irreversible operation (migration, replay, purge, key rotation) has no procedure. List what
   the diff adds; grep the runbook for each.
4. A handler returns a status code or error code the API reference or error catalogue does not
   list, or the catalogue describes a code the handler no longer returns. **Major** on a public or
   multi-team API; **Minor** otherwise. List the codes the handler and mapping can return; compare
   entry by entry.
5. The local development path in the README (compose up, migrate, first request) does not run as
   written. **Major**: it is the first thing a new contributor tries. Run it in a scratch checkout;
   if the environment lacks a container runtime, set `verified: false` and name the command.
6. A deploy-relevant claim is false: "stateless" or "safe to scale horizontally" over in-memory
   state or a local lock, "idempotent" over a handler that is not, "safe to roll back" over a
   one-way migration. **Major**. Grep for in-memory state and local locks; compare with the claim.
7. A metric, log event or alert name is added or renamed without the observability doc, dashboard
   or alert definitions in the tree following. **Minor**; **Major** when an alert references the
   old name. Grep the old and new names under docs, dashboards and alert files.

### False positives (service)

- A runbook kept in an operations repository when the README links to it; the link must resolve.
- A configuration reference generated from struct tags or the loader at build time is not stale on
  the branch; run the generator before filing.
- A probe doc that says "see the manifest" for thresholds is a pointer, not an omission.
- An internal service whose API documentation is the committed OpenAPI or proto file; the file is
  the reference, so check it rather than ask for prose.
