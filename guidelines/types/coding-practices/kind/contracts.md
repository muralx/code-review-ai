### Contracts specifics for coding-practices

The code here is small and its bugs are not crashes: a tag, a type or a generated line that does
not match its source changes bytes that a consumer in another repository decodes.

### Always check (contracts)

1. The schema source changed and the generated stubs did not, or the stubs changed and the source
   did not. **Major** for a skipped regeneration; **Critical** when the stub diff contains a hand
   edit under the generator's banner. Compare the two directories' diff sets; regenerate into a
   temporary directory and diff against the committed stubs.
2. Generated files report a generator version that differs from the one the manifest pins, or the
   stub diff is larger than the schema diff explains. **Minor**: a regeneration on a mismatched
   toolchain produces spurious diffs that hide real ones. Read the version banner in the stubs
   against the manifest; recommend pinning the generator.
3. A validation helper that enforces envelope invariants (required field non-zero, kind in the
   catalog, timestamp set) is relaxed, bypassed by a new constructor, or made optional. **Major**;
   **Critical** when a consumer relies on it to reject malformed input. Diff the helper and grep
   for new construction paths that skip it.
4. A serialization tag or type changes: `omitempty` added or removed on an optional field, a byte
   slice becoming a string, an integer width changing, a field renamed in the tag, casing changed.
   **Critical** when the shape is pinned by a golden or decoded strictly; **Major** otherwise.
   Grep the tag diffs; each one alters wire bytes even when the struct field name is unchanged.
5. A constant's value is edited where its symbol is the only thing callers reference, so the
   change looks internal. **Critical** when the value is a wire string (kind, header, role,
   permission, subject). Diff string literals in constant blocks separately from code.
6. A sorted or ordered invariant the tests assert (permissions strictly sorted, fields in
   declaration order, enum values contiguous) is broken by an insertion in the wrong place.
   **Major**. Run the suite; read the ordering test when one exists and check the insertion
   against it.
7. An error path in a codec returns a partially decoded value beside the error, so a caller that
   ignores the error gets a usable but unverified struct. **Major**. Read each return on a failure
   branch; the zero value and the error together is the expected shape.

### False positives (contracts)

- A generated-stub diff consisting only of the generator's own version banner after a deliberate
  toolchain upgrade is churn; say so once.
- A tag change on a field that no golden pins, whose decoder tolerates unknown and absent fields,
  and whose only consumer is in the same change is additive; confirm all three.
- A new constructor that calls the same validation helper is not a bypass; read the body.
