### Python specifics for documentation

Docstrings are runtime objects read by `help()`, doc generators and editors; the style is a
project choice that tooling checks; type hints are part of the documentation of a signature;
and `__all__` is the statement of what is public.

### Always check (python)

1. A public function, class or module (no leading underscore, or listed in `__all__`) has no
   docstring, or has one in a convention other than the project's (Google, NumPy, Sphinx).
   **Minor**; **Major** on a published library's top-level API. Run `ruff check --select D`
   with the tree's convention, or `pydocstyle`; without one, match the two nearest siblings.
2. A docstring names a parameter that does not exist or omits one that does, or documents a
   return or an exception the code cannot produce. **Major** for a wrong name (the reader
   passes it); **Minor** otherwise. `ruff` D417 or `darglint` when configured; otherwise read
   the signature against the Args section.
3. A public signature has no type hints, or hints that disagree with the docstring's types, in
   a tree that ships `py.typed` or runs a type checker. **Minor**; **Major** when they
   disagree, since one is wrong. Run the tree's type checker on the file and compare.
4. `__all__` disagrees with the documented API: a documented symbol missing from it, an
   undocumented symbol in it, or a name in it that does not exist. **Minor**; **Major** when a
   documented import fails. Run `python -c "from pkg import *; print(sorted(dir()))"` and
   import each documented name.
5. Docstrings contain `>>>` examples that the suite does not run (`--doctest-modules` or the
   `doctest` runner absent from the test configuration) or that fail. **Major** when they fail
   or appear in the README; **Minor** when they never run. Run
   `python -m pytest --doctest-modules <package>` and cite the result.
6. README install instructions name extras (`pip install pkg[extra]`) or a Python version that
   `pyproject.toml` does not declare under `optional-dependencies` or `requires-python`, or the
   README's import name differs from the installed package name. **Major**. Compare the two
   files; run the install line in a scratch environment.
7. A deprecated public symbol emits no `DeprecationWarning` or carries no docstring note naming
   the replacement. **Minor**; **Major** when the replacement does not exist. Grep `warn(`.

### Idioms a reviewer should expect

- One docstring convention per project, declared in `[tool.ruff.lint.pydocstyle]` or the
  pydocstyle config; summary line, blank line, detail, then Args/Returns/Raises.
- Types in the signature, not repeated in the docstring, unless the convention is NumPy.
- `__all__` in `__init__.py` as the public list; leading underscore for everything private.
- Short `>>>` examples in docstrings, run under `pytest --doctest-modules`.
- `warnings.warn(..., DeprecationWarning, stacklevel=2)` plus a docstring note.

### False positives (python)

- Underscore-prefixed names, dunder methods, and `__init__` when the class docstring documents
  the constructor (Google style permits either placement).
- Trivial overrides and properties whose name says everything, when the lint excludes them.
- Missing hints in a tree that does not ship `py.typed` and runs no type checker.
- A doctest that needs a network or credential; `verified: false` with the command named.
