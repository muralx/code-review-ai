### Contracts specifics for documentation

The readers are engineers in other repositories who will not open this module's code before
depending on it; the documentation is what they implement against, and a wire format described
imprecisely is implemented imprecisely.

### Always check (contracts)

1. A wire-affecting change has no changelog entry marked breaking, or the entry names no rollout
   order (which side deploys first, which key or version to add, how long the overlap lasts) and
   no affected consumers. **Major**; **Critical** when the change is marked non-breaking and
   system-design finds it is not. Map each changed shape to its entry; read the entry for the
   three facts.
2. The README's import path, version pin or consumption workflow does not match the manifest or
   how consumers actually depend on the module (a local replace directive documented after
   consumers moved to tags, a module path with the wrong casing or organization). **Major**: a
   new consumer follows it and fails. Compare the README to the manifest and to a sibling clone's
   dependency declaration.
3. A wire format's documentation is not byte-accurate to the code: the documented encoding
   variant, separator, padding, signed input, field order or field set differs from the encoder.
   **Major**: an implementer in another language follows the text. Read the doc beside the encode
   and verify functions; quote both.
4. A wire format or matrix does not cite the normative specification section it mirrors, or cites
   a section that no longer says that. **Minor**; **Major** when the two disagree. Open the cited
   section in the sibling spec clone when one is mounted; compare field by field.
5. The ownership and change-gate statement the tree carries (who owns each family, which changes
   need sign-off, what "breaking" means here) is absent, stale, or contradicted by the change's
   own process. **Minor**; **Major** when the change claims an approval the stated process does
   not grant. Read the governance text and the change description together.
6. A kind catalog, permission list or RPC list in prose or a table disagrees with the code's
   enumeration (one more kind in the code, a renamed permission in the table). **Major**. Count
   and diff the two lists.
7. The doc comment on a codec describes a guarantee the code does not provide (tolerates unknown
   fields when the decoder is strict; rotation by key id when it is positional). **Major**. Read
   the decoder construction and the key loop beside the comment.

### False positives (contracts)

- A changelog entry generated from commit labels needs the breaking label, not a hand-written
  paragraph; read the release tooling before filing.
- Field-level comments restating the schema are not documentation gaps; the bar is the wire
  format description and the changelog, not every field.
- Documentation stating that normative text lives in a sibling repository, with a working pointer,
  is complete; do not ask for a copy.
