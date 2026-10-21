### Quality-gates specifics for documentation

This pack turns the documentation bar into a gate on the changed public surface: documented
in the language's idiom, checked by the doc lint the tree runs, and saying why rather than
what. Spec-implementing and security-sensitive code carries its reason in the comment.

### Always check (quality-gates)

1. The doc lint the tree configures reports on changed files (missing doc on a public symbol,
   malformed tags, a parameter documented under the wrong name). **Minor**; **Major** when
   the tree enforces the lint in CI and the diff would fail it. Run it as CI does (examples:
   `revive`'s exported rule, `ruff` D rules or `pydocstyle`, `eslint-plugin-tsdoc` or
   `typedoc` with warnings as errors, `javadoc -Xdoclint` or checkstyle's Javadoc rules);
   cite the command and the count. Without a configured lint, apply the language amendment by
   reading.
2. A public symbol the change adds has documentation that is not in the language's idiom or
   the project's declared style (does not start with the name in Go, wrong docstring
   convention, type annotations repeated in TSDoc, Javadoc without the tags the tree uses).
   **Minor**. Compare with two sibling symbols in the same package.
3. Code that implements a specific clause of a standard has no citation of document and
   section at the function or block. **Minor**; **Major** when the behaviour is a non-obvious
   requirement a maintainer would otherwise "fix" (a deliberate rejection, an odd ordering, a
   tolerance). Find the clause; look for the citation within the unit or its file header.
4. Security-sensitive code (constant-time comparison, algorithm or key-size choice, a disabled
   or relaxed check, an input limit, a sanitiser) has no comment stating why it is done this
   way. **Minor**; **Major** when a reader would plausibly remove or simplify it. Grep the
   diff for crypto, comparison, limit and skip constructs; read the surrounding comment.
5. A workaround or intentional deviation (a pinned version, a retry around an upstream bug, a
   platform special case) has no comment naming the reason and the condition under which it
   can go. **Minor**. Read each conditional that names a version, platform or vendor.

### Documentation idioms (the language amendment has the detail)

| Language | Form | Public API |
|---|---|---|
| go | GoDoc comment above the declaration | every exported symbol and the package |
| python | docstring in the project's convention | every name in `__all__` or without a leading underscore |
| ts | TSDoc `/** */` | every exported declaration in the emitted declaration file |
| java | Javadoc | every public or protected type and member |

### False positives (quality-gates)

- Private, unexported or internal symbols without documentation.
- A one-line doc that says the one thing the signature does not; brevity is not a gap.
- Comments that restate the code: the general files those as Nit; do not raise them here.
- A citation at package or file level that covers the group of functions beneath it.
