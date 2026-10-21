### Persistence specifics for coding-practices

Persistence code fails in ways the compiler cannot see: a write that escapes its transaction, a
result truncated by an unchecked iteration error, a lost update under concurrency, a statement
that runs on one engine and not the other.

### Always check (persistence)

1. A use case writes more than one table or statement (including the trailing audit, outbox or
   counter row) outside one transaction. **Major**; **Critical** when the partial state is read as
   fact (a balance, an authorisation, a ledger). Count the writes in the use case; name the
   transaction that encloses them all.
2. A store issues a statement on the bare pool while a transaction is active in the call, so the
   write escapes a rollback or blocks on the transaction's own lock. **Major**; **Critical** when it
   escapes the rollback of a write it must accompany. Grep store methods for direct pool use
   instead of the tree's transaction-or-pool accessor.
3. In a tree that supports more than one engine, a statement hard-codes one dialect (placeholder
   style, server-time functions, upsert or returning syntax, driver-specific error codes), or a
   schema change lands in one engine's migration directory only. **Major**; **Critical** when the
   other engine can no longer migrate. Grep for the dialect markers; confirm both migration sets.
4. A constraint violation or other driver error is detected by matching message text rather than
   the error code or class, so a driver, version or locale change silently turns a conflict into an
   internal error. **Major**. Grep the adapters for string matching on error text.
5. A result set is iterated without checking the iteration error afterwards, or not closed before
   the next statement on the same connection, so a mid-iteration failure returns a truncated list
   as success. **Major**; **Critical** when the truncated result drives a decision. Read every
   iteration loop in the diff to its end.
6. The same column is written from the application clock in one path and the database clock in
   another, or an expiry stored by one is compared against the other, so clock skew decides
   validity. **Minor**; **Major** when it decides expiry or ordering. Grep the server-time
   functions and the injected clock for the same column.
7. A nullable column is scanned into a non-nullable type, or a zero value is written where null
   was meant, so a row with null fails to load or absence is stored as zero. **Major**. Compare the
   schema's nullability with the scan targets and the insert parameters.
8. A read-modify-write on one row (counter, balance, status, quota) without a row lock, a
   conditional update or a serialisable transaction, or a dedupe implemented as read-then-insert
   without a unique constraint, so concurrent callers lose an update or insert twice. **Major**;
   **Critical** for money or authorisation. Find the read and the later write of the same row;
   name the lock or constraint between them.
9. A query returns an unbounded number of rows into memory (no limit, no cursor, filtering in code
   after loading everything). **Major** on a request path. Trace the result size to the table it
   reads; name what bounds it.

### False positives (persistence)

- A single-statement write needs no explicit transaction; the engine makes it atomic.
- A tree that targets one engine may use its dialect freely; read the migration directories first.
- A server-time default on a creation timestamp column with no application-side comparison.
- An upsert or conditional update is the lock; confirm the predicate, then drop the finding.
- A bounded administrative export or batch job that documents its size.
