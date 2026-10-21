### Project security notes (example-service)

- Any change under `internal/auth/` is credential material: apply check 4 of the security
  checklist (secrets and key handling) at **Critical** regardless of whether a literal appears.
- `example-service-client` (a sibling clone) is the only intended caller of `/v1/token`; a new
  route under `/v1/` that the client does not call needs a stated consumer in the change.
