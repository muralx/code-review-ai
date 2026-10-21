### Open-source-release specifics for code-structure

The tree has two shapes: what the export tooling publishes and what stays internal. The
public build must succeed from the exported subset alone, and the tooling's view of the tree
must match the tree as it is after the change.

### Always check (open-source-release)

1. A directory, file type or path pattern the change adds has no decision in the export
   configuration (allow or deny list, `export-ignore` attributes, sync manifest), so the
   tooling's default decides whether it ships. **Major**. List the top-level paths the diff
   creates and find each one's rule; a path that matches no rule is the finding.
2. Code on the export path depends on something that does not ship: an import from an
   internal-only directory, a sibling clone reached by relative path, a package from a private
   registry, a build step that reads an internal file. **Critical**: the public build fails or
   pulls private code. Copy the export subset to a temporary directory and run the build and
   the test suite there; cite the failing import or fetch.
3. A generated artefact is committed on the export path without its generator and the command
   to run it, or is stale against its source. **Minor**; **Major** when a public contributor
   cannot regenerate it or the stale output differs in behaviour. Run the generator into a
   temporary location and diff.
4. Build, CI or packaging files that ship reference paths outside the export subset (a make
   target, a workflow path filter, a packaging include). **Major**. Grep paths in the shipped
   build files and stat each against the export subset.
5. The export configuration references paths that moved or were renamed in the change, so a
   rule no longer matches and a previously excluded directory ships by default. **Major** when
   an internal path becomes exported; **Minor** when the rule is merely dead. Run the export
   tooling's dry run when it has one; otherwise diff the rule set against the tree's paths.
6. Test helpers or fixtures on the export path depend on internal services or sibling clones,
   so the public suite cannot run. **Major**. Grep test code on the export path for relative
   sibling paths, internal hostnames and environment variables only the internal CI sets.

### False positives (open-source-release)

- Internal directories the export configuration excludes explicitly; the rule is the proof.
- Generated files committed by the ecosystem's convention (schema bindings, protocol stubs)
  with a documented regeneration command that reproduces them.
- Build targets that tolerate an absent optional path and say so.
- A sibling clone used only by an opt-in integration suite that the public CI skips by
  default, with the skip condition visible in the test.
