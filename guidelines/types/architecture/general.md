### What to read first

- The diff's new, moved and removed imports and dependency declarations: layering changes show
  there before they show in code.
- The layer map the tree already implies: top-level directories, a design doc if one exists,
  and the import direction between the packages the change touches most.
- Every caller, in the whole tree and in sibling clones, of each shared symbol the change
  renames, retypes, reorders or removes. The diff shows the definition; the harm is at the
  call sites.
- Model, schema and configuration definitions the change edits, beside whatever migrates,
  validates or defaults them.
- In an audit: the dependency graph between top-level packages, then the most-imported
  modules and the largest files. Findings are `pre-existing`; locate each at the edge or
  definition that embodies it, not at a random use.

### Always check

1. The change crosses a layer the tree keeps separate: a handler reaching into storage, a
   domain package importing a transport or framework type, a utility importing a feature.
   **Major**. List the diff's new imports; compare their direction with what every existing
   sibling in the same layer does. One inverted edge is the evidence.
2. A new abstraction (interface, base class, registry, generic wrapper) has one implementation
   and no concrete second one named anywhere. **Minor**; **Major** when it hides a type that
   callers must reason about or that tests must now mock. Count implementations in the tree;
   name the planned second one from the change description, or state there is none.
3. An extension point is added for a case nobody has, or a real variation point is hard-coded
   where the second case already exists. **Minor**; **Major** when the hard-coded branch
   duplicates one already in the tree. Grep for the second case: a hook with no caller and no
   test is speculation; a copied branch is the opposite failure.
4. The change couples components that were independent: a package importing its consumer, a
   new shared mutable global, a type from one module appearing in another's signature, an
   import cycle. **Major**. Build the before and after import set of the touched packages;
   a new edge between previously unrelated modules, or a cycle, is the finding. Run the
   toolchain's cycle or dependency check when it has one.
5. A data model change (new field, changed type, removed column, narrowed enum) has no
   migration for existing data, or the migration and the model disagree. **Critical** when
   existing records can no longer load; **Major** otherwise. Read the migration beside the
   model; run it against the fixture or test database when the project has one.
6. Configuration surface grows with a knob that has no default, no validation, or is read in
   more than one place with different parsing. **Minor**; **Major** when an unset value fails
   at first use rather than at startup. Grep every read of the key; start the program with
   the key absent and with a malformed value.
7. An in-process contract changes incompatibly: a signature, an interface method, an exported
   type, an error a caller matches on, a hook order, an event payload. **Critical** on a
   published surface (library API, plugin interface); **Major** inside one tree. Grep all
   call sites; build the tree and every sibling clone that depends on it.
8. The change solves a problem the codebase already solves another way, so two mechanisms now
   coexist (two config loaders, two error hierarchies, two ways to register a route).
   **Minor**; **Major** when the older mechanism carries behaviour the new one drops. Point
   at the existing mechanism by path and say what the new one lacks.
9. A business rule lives, or is duplicated, where it cannot be tested without infrastructure:
   in a handler, in SQL, in a template, and also in the domain layer. **Minor**; **Major**
   when the copies can drift. Find the test that exercises the rule and note what it must
   stand up; find the second copy by grepping its constants.
10. The change makes a concrete, likely next change harder: adding a second storage backend,
    a second transport, a second tenant, a second output format. **Minor**; **Major** when
    that change is already planned in the tree (TODO, issue reference, half-built branch
    point). Name the future change and the exact line that would have to be rewritten.

### Common false positives

- A one-implementation interface at a boundary the project already uses for tests or for a
  language's package-split rule is house style, not speculation. Match the tree's practice.
- A cross-layer edge the change merely repeats from existing code is `pre-existing`; raise it
  once with the count, not once per site, and never as `caused-by-change`.
- Removing a symbol with no caller in the tree, the sibling clones or generated code is not a
  contract break. Check reflection, codegen and serialized names before deciding.
- A new configuration key with a sane default, validation at startup and one read site is
  ordinary growth, not a finding.
- Shape a framework mandates (ORM base class, DI registration, handler signature) looks like
  coupling but is the framework's convention; the project chose it before this change.
- Moving code without changing it is churn; say so once and leave placement to code-structure.

### What this type does not cover

Cross-process behaviour, wire compatibility, migrations under rolling deploy and anything
operational belong to **system-design**; file placement and naming to **code-structure**.
