### Python specifics for code-structure

Python has no compiler to enforce boundaries: imports run code at module load, any name is public unless convention says otherwise, and the package layout decides whether tests exercise the installed package or whatever happens to be on `sys.path`.

### Always check (python)

1. A module imports another inside a function body, under `if TYPE_CHECKING:` for a runtime need, or with `importlib` to dodge a circular import rather than fix the dependency direction. **Major**. Run `python -c "import pkg.module"` for each touched module from a clean interpreter and `python -X importtime -c "import pkg" 2>&1 | sort -k2 -n | tail` to see what the import drags in; cite both edges of the cycle.
2. The package uses a flat layout (package next to `pyproject.toml`) while tests import it without installing, or a `src/` layout where tests import from the source path rather than the installed package. **Minor**; **Major** when a shipped `pip install` misses modules the tests pass against (missing `packages`/`package-dir` in `pyproject.toml`). Run `pip install -e . && python -c "import pkg; print(pkg.__file__)"` in a scratch environment and confirm the path.
3. `__init__.py` re-exports everything with `from .x import *`, imports heavy submodules eagerly so `import pkg` pulls in a web framework or a database driver, or omits `__all__` while the package documents a public API. **Minor**; **Major** when a light consumer now depends on a heavy optional dependency. Read `__init__.py` and `python -X importtime` output; cite the module that costs the most.
4. Settings are read with `os.environ` scattered across modules, or a `config.py`/`settings.py` imports application modules (the dependency runs upward), or constants are duplicated in two settings modules. **Minor**; **Major** when two readers of the same variable apply different defaults. Grep `os.environ` and `getenv` across the tree; one typed settings module is the expected shape.
5. Script code lives in library modules: `if __name__ == "__main__":` blocks with real logic in importable modules, `sys.argv` or `argparse` parsing in a module other modules import, `sys.exit` outside an entry point. **Minor**; **Major** when importing the module runs side effects. Grep `sys.argv`, `sys.exit(`, `argparse` outside `cli.py`/`__main__.py`/`[project.scripts]` targets.
6. A public function or class (no leading underscore, exported from `__init__`, documented) has no type annotations or returns `Any`/untyped `dict` where callers must know the shape, while the tree annotates its public API. **Minor**; **Major** for a library consumed outside the repo. Run `mypy --strict` or `pyright --verifytypes pkg` when the project types; cite the unannotated signature.
7. A module exceeds what the tree treats as normal (a `utils.py` or `helpers.py` collecting unrelated functions, a `models.py` past the size of its neighbours), or a new module is named for its type (`utils`, `misc`, `common`) rather than its concept. **Minor**. Measure with `wc -l` against sibling modules and cite the numbers; `ruff check --select PLR0915,C901` when the config enables complexity rules.
8. Tests mirror the wrong thing: `tests/` not mirroring the package path, a `test_*.py` beside production code in a tree that keeps a `tests/` directory (or vice versa), or test helpers imported from production modules. **Minor**. Compare the new test's path with the tree's existing pattern and cite one existing example.

### Idioms a reviewer should expect

- `src/<pkg>/` layout with `pyproject.toml` declaring the package, or a consistent flat layout; not both in one repo.
- `__all__` in `__init__.py` naming the public surface; private modules prefixed `_name.py`.
- One `settings`/`config` module built from the environment, imported by everything, importing nothing of the application.
- Entry points declared under `[project.scripts]` pointing at a thin `cli.py`/`__main__.py`, with logic in importable modules.
- Absolute imports (`from pkg.sub import x`) over relative imports beyond one level; no `sys.path` manipulation outside `conftest.py`.
- `TYPE_CHECKING` imports only for annotations; `from __future__ import annotations` where the tree uses it.
- Modules named for a concept (`billing.py`, `retry.py`), not for a type of code (`utils.py`, `helpers.py`).

### False positives (python)

- A deliberate lazy import of an optional heavy dependency (`import pandas` inside the one function that needs it), documented as optional in `pyproject.toml` extras.
- A `TYPE_CHECKING` import that is only used in annotations under `from __future__ import annotations`; that is the idiom, not a cycle hack.
- A single `conftest.py` doing `sys.path` insertion in a flat-layout repo without a `pyproject.toml` package, when the tree documents it.
- A large `models.py` or `schemas.py` that is one cohesive set of declarations; size alone is not a finding.
- Relative imports within one package in a tree that consistently uses them.
