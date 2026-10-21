### Hexagonal-service specifics for coding-practices

The tree has named a short list of forbidden patterns because each defeats a property the layering
is meant to give: cancellable shutdown, testable construction, one log line per failure, a domain
that cannot crash the process. Each check below is one of those patterns.

### Always check (hexagonal-service)

1. A sleep or fixed delay in production code that ignores cancellation (in a retry, poll or
   backoff loop), so shutdown waits for it and deadlines are not honoured. **Major**. Grep for sleep
   and delay calls outside tests; each must be the language's cancellable wait (a select on
   cancellation, an awaitable with abort, a timed wait on the token).
2. A goroutine, task or thread started in a service or adapter with no owner: nothing holds its
   cancellation and nothing waits for it at shutdown. **Major**. For each spawn name the owner, the
   cancellation and the wait; a spawn-and-forget is the finding.
3. Setup at import or initialisation time: a connection, client, pool, registry or config read in
   a module initialiser, static block or package-level variable, or a process-wide default client
   shared by adapters. **Major**: it cannot return an error, cannot be tested in isolation and
   hides ordering. Grep initialisers and package-level assignments with side effects.
4. An error is logged and then returned at a non-boundary layer, so the same failure appears once
   per layer and the actionable line is buried; or the boundary neither logs nor maps it.
   **Minor**; **Major** when a server-side failure leaves no log line at the boundary. Grep log
   calls in services and adapters followed by a return of the same error.
5. A cancellation carrier (context, abort signal, deadline) stored on a long-lived struct, or a
   fresh root context created inside a request or message path. **Major**. Grep struct fields of
   the carrier's type; grep root-context constructors outside the composition root and tests.
6. A panic, abort or process exit outside the entry point: in a handler, service, adapter or
   consumer. **Major**; **Critical** on a path no recovery middleware covers (a consumer, a
   background worker, a spawned task). Grep for panic, exit and uncaught throw as control flow.
7. A floating-point type for money, quantities or anything compared for equality or summed to a
   ledger. **Major**; **Critical** when it reaches a price, balance or invoice. Grep domain and
   adapter types for float fields named for amounts; the fix is integer minor units or a decimal
   type.
8. Observability passed as separate pieces: a constructor takes a logger, a tracer and a meter as
   individual parameters, so one layer gets logs with no trace correlation. **Minor**. Read
   constructor signatures against the siblings that take the one provider.

### False positives (hexagonal-service)

- A sleep inside a test is the testing type's concern, not this pack's.
- A process-lifetime task started at the composition root with the server's shutdown as its stop.
- A panic or exit at the composition root on an unrecoverable startup failure.
- An initialiser that only registers a pure codec or format with no I/O.
- A logger or tracer derived from the provider and stored on a component at construction.
- A float for a measurement or ratio that is never summed into money.
