### Persistence specifics for system-design

The service owns a relational database that outlives every release and is shared by the old and
new replicas during a rolling deploy. A migration is a production event with a lock, a duration
and a rollback, and the review treats each statement as one.

### Always check (persistence)

1. An index on a table with live traffic is created without the engine's online or concurrent
   option, or with it inside a transaction block where the engine forbids that, so the statement
   locks writes or fails mid-run. **Major**. Grep new migrations for index creation; read the
   runner for whether it wraps each file in a transaction; check the engine's rule for that form.
2. A column is added with a non-null default or a volatile default on a large table, or a backfill
   runs as one statement, so the table is rewritten or locked for the duration and replication
   lags. **Major**. Read the engine version in the deploy and test manifests (a constant default is
   metadata-only on recent engines, a volatile one is not); a backfill must be batched with a
   bound.
3. A constraint (foreign key, check, not null) is added and validated in one step over an existing
   table rather than added unvalidated and validated separately. **Major**. Read the statement; the
   two-step form is the fix on engines that support it.
4. An up migration has no down, or the down loses data with no stated consequence. **Major** for
   the missing down; **Minor** for a lossy down with a comment and a decision. List the pairs; a
   destructive down must say what is lost and who accepted it.
5. An already-applied migration file is edited, renumbered or reused. **Critical**: a checksum
   runner aborts every environment's next deploy; a plain runner lets environments diverge
   silently. Diff the migrations directory for modified existing files; the fix is a new version.
6. A migration file holds several statements on an engine without transactional DDL, or the runner
   applies files outside a transaction where it could use one, so a failure leaves the schema
   between versions and the retry fails on the first statement. **Major**. Read the runner and the
   engine; each statement must be re-runnable or the file atomic.
7. The pool's maximum connections times the replica count exceeds the database's connection
   limit, or the pool sets no connection lifetime and no statement timeout, so a failover or a
   stuck query holds the pool forever. **Major**. Read the pool config, the replica count and the
   database limit in the manifests; multiply.
8. Code in the same release reads or writes the new shape only, with no release in which both
   shapes are read, so the previous release fails on the migrated schema or the rollback strands
   rows. **Major**; **Critical** when the rollback loses writes. Map the migration to the code that
   reads each column; write the rollback step by step.

### False positives (persistence)

- An additive migration (nullable column, new table, new sequence) is safe under rolling deploy
  and needs none of the above.
- An index built on an empty or newly created table in the same migration needs no concurrent
  option.
- A constant default on an engine and version that applies it as metadata; cite the version.
- A down that is deliberately lossy with the consequence stated in the file.
- A seed or fixture migration that runs only in a development profile.
