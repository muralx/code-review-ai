### Contracts specifics for security

The module mints and verifies the tokens, cookies and permission decisions every service trusts;
the attacker holds a token and the public source, and every consumer inherits whatever this
module gets wrong.

### Always check (contracts)

1. A verifier's errors become finer-grained: "bad signature" distinguishable from "wrong key",
   "expired" from "malformed", by error type, message or timing. **Major**. Coarse errors are the
   design; a distinguishable failure is an oracle. Diff the error returns of every verify path; a
   new sentinel or message on a failure branch is the finding unless the tree documents it as
   intended.
2. A permission-matrix cell changes. Removing a role from a permission locks that role out; adding
   one escalates it. **Critical** either way without a stated reason that matches the normative
   source the tree cites. Diff every cell by hand against that source; a test that spot-checks a
   few cells is not a guard for the rest.
3. The permission check stops denying by default: an unknown role, unknown permission, empty
   principal or missing matrix row now resolves to allow, or a lookup error is swallowed as true.
   **Critical**. Read every return of the lookup function; trace what a role string not in the
   matrix produces.
4. A step-up tier is lowered for an operation (strong factor to recency, either to none), or an
   operation is removed from the step-up table so it falls to the default. **Critical** unless the
   change argues it and the normative source agrees. Diff the table; a row that moves down or
   disappears is the finding.
5. The signature covers less than what is acted on: a claim read from the payload before
   verification, a field outside the signed bytes used for an authorization decision, an
   unverified decode helper (key-id lookup) feeding anything but key selection. **Critical**.
   Trace every field a consumer reads to the bytes the signature covers.
6. Expiry, audience or issuer checks are removed, made optional, or compared with a clock skew
   larger than the token lifetime; or the verifier accepts an algorithm or key length the minter
   never produces. **Critical**. Read the verify function to its last line; each check it drops
   is a finding.
7. A token-bearing event, log field or fixture carries the secret in clear: a plaintext token where
   the contract says encrypted, a classification change that routes it to an unencrypted stream, a
   fixture with a real-looking signed token. **Critical** for plaintext on the wire; **Major** for
   a fixture that could be real. Grep the token field name; read its type and the classification
   set.
8. Comparison of a MAC or signature is not constant-time, or the key list is iterated in a way that
   leaks which key matched. **Major**. Read the compare call; plain equality on secret bytes is the
   finding.

### False positives (contracts)

- An error that distinguishes a malformed token (wrong part count, bad encoding) from a verify
  failure is a parsing error, not an oracle, when it fires before any key is touched; read the
  order.
- Adding a role to a permission that the normative source already grants it is reconciliation,
  not escalation; cite the source and drop the finding.
- Test keys that are all zeros or labelled as test material are not leaks; a fixture signed with a
  key that also appears in deployment config is.
- An unverified decode that returns only the key id, used only to select the verification key, is
  the standard pattern; the finding is any other field leaving it.
