### Service specifics for coding-practices

A service is a long-lived process serving many callers at once: a bug that would be harmless in a
script becomes cross-request leakage, a wrong status code, a connection leak that surfaces hours
later, or a message lost or redelivered forever.

### Always check (service)

1. A handler writes an error response and continues: the mutation still runs, or a second status
   and body are written over the first. **Critical** when the rejected operation executes;
   **Major** for the double write. Read every error branch in the handler to its end; a write not
   followed by a return is the finding.
2. A new domain or adapter error has no case in the error-to-status mapping, so a client fault
   returns a server error (and triggers client retries and alerts) or a server fault returns a
   client error. **Major**. List the sentinels the diff adds or returns; read the mapping table;
   name the missing case.
3. An outbound response body is not closed, or not drained before close on a non-success status,
   so connections are not reused and the pool leaks under error load. **Major**. Grep new client
   calls for the close and the drain on every status branch.
4. Work started from a handler inherits the request's cancellation, so a client disconnect kills
   it mid-write; or runs with no cancellation and no owner; or runs outside the recovery
   middleware so a panic takes the process down. **Major**; **Critical** when the killed work is a
   write already acknowledged to the client. For each spawn in a handler name the context it uses,
   the owner that waits for it and what recovers a panic in it.
5. Per-request data (identity, tenant, locale, request id, a logger with request fields) is stored
   on a long-lived object (handler struct, singleton client, pooled connection, package variable)
   and read by the next request. **Critical** for identity or tenant; **Major** otherwise. Grep
   struct fields and package variables written from a request path.
6. A consumer acknowledges before its side effects complete (a crash loses the message), or
   returns a retryable failure for a permanent fault with no attempt cap or dead letter (a poison
   message redelivers forever). **Critical** for the lost message; **Major** for the loop. Read the
   ack placement and the error classification in the handler.
7. A partial-update request body cannot distinguish absent from explicit zero (non-pointer or
   non-optional fields), so an omitted field clears a stored value. **Major**. Read the update DTO
   field types against the fields the store writes.
8. A readiness or liveness probe does I/O with no deadline (ping, query, broker call), so a slow
   dependency makes the probe time out and the orchestrator restarts a healthy replica. **Major**.
   Read the probe closure; the context it passes must carry a deadline shorter than the probe
   timeout in the manifest.

### False positives (service)

- Background work deliberately detached from the request with a fresh root context, a named owner
  and a shutdown path; the detachment must be visible, not accidental.
- A fall-through to a generic server error for an error nobody anticipated; the finding is a known
  sentinel with no case.
- A liveness probe that returns success with no I/O at all; that is the correct shape.
- A derived logger stored on a component at construction (a component field, not request state).
