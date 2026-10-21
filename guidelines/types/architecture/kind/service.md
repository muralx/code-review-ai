### Service specifics for architecture

A deployable service has one composition root that owns wiring; layering is judged against the
transport, domain and persistence split the tree already names.

### Always check (service)

1. A handler runs a query, opens a transaction or builds a storage model directly, or a
   persistence package returns transport types (status codes, request structs). **Major**. Read
   the handler's imports beside two existing handlers; an import the siblings route through the
   domain is the evidence.
2. Configuration is read outside the loader: an environment, flag or config-file read inside a
   handler, repository or domain function. **Major** when the value differs per environment;
   **Minor** otherwise. Grep the diff for such reads; each must sit in the tree's config package.
3. A component constructs its own dependency (client, pool, clock built in the constructor or at
   package init) instead of receiving it. **Minor**; **Major** when an existing test of it now
   needs the network. The dependency must be a parameter here and a value in the composition root.
4. Shutdown is unordered: a new listener, worker, consumer or pool is not added to the shutdown
   sequence, or is stopped before the component that still uses it. **Major**. Find the shutdown
   function and list what it closes in order; the new resource must appear after its users.
5. A cross-cutting concern (auth, logging, tracing, retries, tenancy) is implemented inside a
   handler or repository rather than in the middleware or decorator layer the tree uses for it.
   **Minor**; **Major** when a second copy exists. Grep the helper; count call sites bypassing it.
6. The domain layer gains an import of a transport or persistence framework type (ORM entity,
   request context, HTTP status), so a business rule needs that framework to run. **Major**.
   List the domain package's imports before and after; one new framework import is the finding.

### False positives (service)

- A small service whose tree is one package by design: judging it against layers it never had
  is invention. Note the absence once as `pre-existing`, Minor, or not at all.
- A handler that validates and maps request fields is doing transport work, not crossing a
  layer; construction inside the single composition root is where wiring belongs.
- Framework-mandated lifecycle hooks (startup and shutdown annotations, server hooks) are the
  tree's ordering mechanism; read the hook before counting a resource as unregistered.
