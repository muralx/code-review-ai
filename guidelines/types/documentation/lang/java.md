### Java specifics for documentation

Javadoc is compiled by the `javadoc` tool with doclint, so most defects are mechanical and
reportable; the public API is what the module and package system exposes, and deprecation is
both an annotation and a tag.

### Always check (java)

1. A public or protected type, constructor or method has no Javadoc, or `javadoc
   -Xdoclint:all` (or the tree's checkstyle Javadoc rules) reports new errors on changed
   files. **Minor**; **Major** on a published library. Run the project's Javadoc goal or task
   with doclint, or checkstyle as CI runs it; cite the count.
2. `@param`, `@return` or `@throws` is incomplete or wrong: a parameter missing or named after
   a renamed one, a non-void method without `@return`, a checked exception or an
   argument-validating unchecked exception thrown explicitly and not tagged. **Major** for a
   wrong parameter name; **Minor** otherwise. Doclint reports the first two; read `throw`
   statements for the third.
3. Deprecation is half done: `@Deprecated` without an `@deprecated` tag or the reverse
   (`javac -Xlint:dep-ann` reports it), no `{@link}` to the replacement, no `since` or
   `forRemoval` where the tree uses them. **Minor**; **Major** when the replacement is absent.
4. A new public package has no `package-info.java`, or the existing one describes a purpose
   the package no longer has. **Minor**. Stat the file; read it against the package's types.
5. `module-info.java` does not export a package the docs present as public, or exports one the
   docs call internal; or the module declaration has no doc comment where the tree documents
   modules. **Major** when a consumer cannot access a documented type; **Minor** for the
   missing comment. Run `jar --describe-module` on the built artifact.
6. README build coordinates (`groupId`, `artifactId`, version, minimum JDK) do not match the
   build file, or a `{@snippet}` or `{@code}` example references a class or method that no
   longer exists. **Major** for coordinates; **Minor** for snippets. Compare with the build
   file; doclint reports broken `{@link}` and `@snippet` references.
7. `{@link}` or `@see` points at a symbol that does not exist or is not visible from the
   documented element. **Minor**. Doclint's `reference` group reports it.

### Idioms a reviewer should expect

- First sentence is the summary and ends with a period; then `@param` in order, `@return`,
  `@throws`, `@see`, `@since`, `@deprecated`.
- `@Deprecated(since = "2.3", forRemoval = true)` paired with `@deprecated Use {@link Y}.`
- `package-info.java` per public package; a doc comment on `module-info.java`.
- `@implSpec`, `@implNote`, `@apiNote` on interfaces and abstract classes.
- `{@inheritDoc}` or no comment on overrides that keep the contract.
- `{@snippet}` (JDK 18+) or `{@code}` for examples; checkstyle `MissingJavadocMethod` and
  `JavadocMethod` enforcing the above.

### False positives (java)

- Private and package-private members; test classes.
- Overrides without Javadoc that inherit the supertype's; the rendered page shows it.
- Trivial getters, setters and constructors when the checkstyle configuration excludes them.
- `@since` absent in a tree that does not use it anywhere.
