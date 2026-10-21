### Library specifics for architecture

A library's exported surface is a contract other trees compile against; judge every change by
what a consumer on the previous version would see.

### Always check (library)

1. An exported symbol is removed, renamed or retyped, gains or reorders a parameter, or an
   exported type gains a required field, with no major version bump or deprecated alias.
   **Critical**. Diff the public surface (API diff tool, declaration diff, grep of exports).
2. A type the library did not define leaks into public signatures: a dependency's struct, error
   or enum in an exported function, so that dependency's version joins the contract. **Major**.
   List the imports each exported signature in the diff uses; a third-party type is the finding.
3. A dependency is added for something the standard library or an existing dependency already
   does, or bumped across a major version every consumer must now satisfy. **Major**. Read the
   manifest diff; name the function that already covers the use, or the constraint that breaks.
4. The library holds process-wide mutable state: a package-level registry, default client or
   cache mutated by an exported setter, so two consumers in one process fight. **Major**;
   **Critical** when it carries credentials or tenant data. Grep package-level writes after init.
5. Behaviour a consumer must customise is reachable only by forking: a hard-coded transport,
   clock, serializer or logger with no injection point. **Minor**; **Major** when an issue or a
   sibling clone already needs the variation. Read the constructor; list what it fixes.
6. A default changes value or meaning (timeout, encoding, strictness) with no major version
   bump. **Critical** when the same call now returns different results; **Major** otherwise.
   Diff the defaults and compare with the version bump.

### False positives (library)

- Symbols under the language's private convention (`internal/`, leading underscore,
  `@internal`, unexported) are not public surface; the general checks cover them.
- A pre-1.0 or explicitly unstable module may break under a policy the project states; cite
  the policy and lower a Critical to Major.
- A dependency type on the surface of a library whose purpose is to adapt that dependency (a
  driver, a plugin) is the point, not a leak; a one-implementation interface at the library
  boundary is the seam consumers mock, not speculation.
