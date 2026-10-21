### Standards-driven specifics for coding-practices

Code on a spec-defined surface has a correctness oracle outside the tree: the governing
document. The author's intent, the previous behaviour and the most popular peer are not that
oracle; the text is, read at its normative level.

### Always check (standards-driven)

1. A behaviour change on a spec-defined surface (endpoint, message, header, state machine,
   encoding, error) names no governing document and section in the change, or names one that
   does not say what the code now does. **Major**; **Critical** when the new behaviour
   contradicts a MUST. Open the cited section in the copy of the standard the tree keeps or
   mounts (a `docs/standards/` directory, a documentation index provided to the run) or in
   the published text; never judge from recall. Quote the clause in `evidence`.
2. Normative levels are conflated: a SHOULD or MAY enforced as rejection, a MUST made optional
   or switchable off, a draft, an expired draft or an ecosystem convention enforced as if it
   were published text. **Major**; **Critical** when the code rejects input the standard says
   MUST be accepted. Find the keyword in the clause and the document's status line (published,
   draft and its version, informational) and compare with how the code treats it.
3. The request or response shape, status code or error code of a spec-defined endpoint changes
   with no versioned alternative: no new version, endpoint, capability flag or negotiated
   parameter that lets existing peers keep the old behaviour. **Critical** on a released
   surface. Diff the serialiser, the status mapping and the error table; grep the tests for
   the old shape and read what the diff did to them.
4. A field is added as required to an existing message, or an optional field becomes required,
   so every peer that omitted it now fails. **Critical** on a released surface; **Major** when
   the standard already marks the field REQUIRED and the code was lax. Diff schema, struct
   tags and validators; look for a default, a version gate or a migration note.
5. A metadata or discovery document the surface publishes (capabilities, well-known endpoint,
   supported algorithms or methods, schema version) no longer matches behaviour: a value
   advertised that the code rejects, or a behaviour implemented that the document hides.
   **Major**; **Critical** when a peer selects an advertised option and is refused. List every
   advertised value and grep the handler's allow-list for each; do the same in reverse.
6. A wire field, parameter or error code differs from the standard's spelling, case or
   registered value, or a standard term is used for a different concept. **Major**: peers
   match by exact string. Compare struct tags, serialiser keys and constants with the
   standard's field table or registry; cite both spellings.

### False positives (standards-driven)

- An extension in the namespace the standard reserves for extensions (vendor parameter,
  prefixed field, registered extension point) that the tree documents as such.
- Stricter behaviour where the standard permits it ("MAY reject", "SHOULD NOT accept") and
  the change says so; strictness is a finding only when it refuses what MUST be accepted.
- Draft-level behaviour behind a flag that is off by default and labelled with the draft's
  name and version.
- A difference from a widely deployed peer when the published text is on the code's side; the
  peer's quirk belongs in an interop note, not in the implementation.
- Internal plumbing in the same file (logging, metrics, storage) that is not part of the
  spec-defined surface; this pack applies to the surface only.
