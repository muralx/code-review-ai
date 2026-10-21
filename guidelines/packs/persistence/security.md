### Persistence specifics for security

The database is where every tenant's data sits in one place; the controls that keep them apart
(roles, grants, row policies, parameterisation) live partly in migrations and partly in the
transaction wrapper, and one bypass of either is a cross-tenant read.

### Always check (persistence)

1. SQL is built from strings in any form: concatenated fragments in application code, a stored
   procedure or trigger that executes concatenated text, a sort column, filter column or table name
   taken from input without an allow-list, an identifier interpolated without identifier quoting.
   **Critical**. Grep the diff and the migrations for execute-with-concatenation and format calls
   lacking identifier and literal quoting; trace every non-parameter fragment to a constant or an
   allow-list.
2. The service connects as the migration owner, the schema owner, a superuser or a role that
   bypasses row policies, or with TLS verification disabled outside the local profile; ownership
   and bypass silently void every grant and policy. **Critical**. Read the roles the migrations
   create and the user in the production connection config; the application role must own nothing,
   bypass nothing and hold only the grants it uses.
3. Tenant or row scope is set per connection or per session rather than per transaction, or is set
   in application filters only, so a pooled connection carries one request's scope into the next.
   **Critical**. Read the transaction wrapper: the scope statement must be transaction-local and
   issued on every transaction; a query path that reaches the pool outside the wrapper runs
   unscoped.
4. A new tenant-scoped table has no row policy, has a policy that scopes reads but not writes, or
   is not forced for the owner, so a cross-tenant insert or update succeeds. **Critical**. Compare
   the migration with a sibling tenant table's policy block clause by clause.
5. A bypass role or cross-tenant transaction (for sweepers, admin tools, workers) is reachable from
   a request handler. **Critical**. List the callers of the bypass wrapper; none may sit under a
   route or a message subject an external principal reaches.
6. An append-only table (audit, ledger, event log) lacks the grant revocation and trigger that
   reject update and delete, or a code path updates or deletes from it. **Critical**: audit
   integrity is the control. Read the grants and triggers in the migration; grep the tree for
   mutating statements against the table.
7. A credential, token or recovery code is stored as plaintext, or compared with a
   non-constant-time equality after lookup. **Critical**. Follow the value from issuance to the
   insert; only a digest may reach the column, and the lookup compares digests.
8. The application role is granted more than it uses: all privileges, DDL, or grants on tables it
   never touches, so a compromised service can alter schema or reach data outside its paths.
   **Major**. Read the grant statements against the queries the adapters issue.

### False positives (persistence)

- An identifier interpolated through the tree's identifier-quoting function from a hard-coded
  allow-list or an identifier-validated constant.
- Migrations run by the owner role from a separate job or init container; that separation is the
  design, and the service's own role is what to read.
- A table with no tenant column (a global class: users, sessions keyed by natural key) carrying no
  row policy, when the tree documents the class.
- A superuser in the local compose file when the production manifest names the restricted role.
