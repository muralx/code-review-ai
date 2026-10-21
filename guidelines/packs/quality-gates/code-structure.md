### Quality-gates specifics for code-structure

Size is a gate with default numbers: a method or function around 40 lines, a file around 400,
a class or module around 8 public methods. The company or project overrides them; the tree's
linter configuration, when it sets limits, is the declared norm. The gate applies to units
the change adds or grows, measured, with numbers cited and compared with the tree's norm.

### Always check (quality-gates)

1. A function or method the change adds or grows exceeds the method limit. **Minor**;
   **Major** when it also carries phases that cannot be exercised separately (the general's
   rule). Count body lines before and after the change; compute the median length of the
   sibling functions in the same package; cite all three numbers.
2. A file the change grows exceeds the file limit. **Minor**. Count lines before and after;
   cite the longest sibling file in the directory for comparison.
3. A class or module gains a public method and exceeds the public-method limit. **Minor**;
   **Major** when the new method belongs to a different responsibility than the rest (two
   unrelated sets of callers). Count exported or public members; list callers of the new one.
4. Cyclomatic or cognitive complexity, or nesting depth, exceeds the threshold the tree's
   linter configures, on a unit the change adds or grows. **Minor**. Run the linter's
   complexity check (`gocyclo`, `ruff` C901, `eslint complexity`, checkstyle or pmd
   `CyclomaticComplexity`, as configured); cite the reported number.
5. Size or complexity limits in the linter configuration are raised, disabled or excluded for
   a path in the diff. **Major**. Diff the configuration and cite the rule.

### False positives (quality-gates)

- A unit over the limit that the change touches by a line or two without growing it;
  pre-existing, one `follow-up` line at most.
- One cohesive table, schema, enumerated mapping, generated file or table-driven test; size
  alone is not a finding.
- A tree whose configured limits are higher than the defaults; the configuration governs.
- A long linear sequence with no branching (a builder, a wiring function) when the tree keeps
  such functions at that length everywhere.
- A split that would exist only to satisfy the number: a helper with one caller and six
  parameters is worse structure, not better. Do not propose it.
