### Python specifics for coding-practices

Python hides failure well: exceptions are the only error channel, resources are released by convention not by the compiler, and types are documentation unless a checker runs. Treat the type checker and the linter as your first witnesses.

### Always check (python)

1. A bare `except:` or `except Exception:` wraps code whose result is used afterwards, or re-raises with `raise X` instead of `raise X from e`, or `pass`es. **Major** when the result is used; **Minor** when only diagnostics are lost. Run `ruff check --select E722,BLE001,B904` on the changed files and cite the hit; a bare `except` also swallows `KeyboardInterrupt` and `SystemExit`.
2. A mutable default argument (`def f(items=[])`, `=dict()`, `=set()`) is mutated inside the function. **Major** when the default is ever mutated; **Minor** otherwise. `ruff check --select B006,B008` finds the pattern; read the body to see whether it writes to the parameter.
3. A file, socket, lock, DB cursor, `subprocess.Popen`, `tempfile` or `httpx`/`aiohttp` client is opened outside a `with` block or without `try/finally` on every exit. **Major**. `ruff check --select SIM115` catches the simple cases; for clients and locks read each exit path by hand.
4. Async code blocks the loop: `time.sleep`, `requests`, synchronous file or DB calls inside `async def` without `asyncio.to_thread` or `run_in_executor`. **Major**. Grep the `async def` bodies in the diff for `time.sleep(`, `requests.`, `open(`, `.execute(` on a sync driver; `ruff check --select ASYNC` covers the common library calls.
5. A coroutine is called and never awaited, or a task from `asyncio.create_task` is not stored or awaited, so exceptions vanish and the task may be garbage-collected mid-flight. **Major**. `ruff check --select RUF006` plus `python -W error::RuntimeWarning -m pytest -x -q` surfaces "coroutine was never awaited"; cite the warning.
6. Type hints disagree with runtime: `Optional` missing on a parameter that receives `None`, a return annotated `str` that returns `None` on one branch, `dict` where the body uses attributes. **Major** when the checker reports an error on a path the diff touches; **Minor** for a hint that is merely loose. Run `mypy` or `pyright` with the repo's config when one is present; with none, run `pyright` on the changed files and report what it says.
7. A `@dataclass` with a mutable field default (`list`, `dict`) without `field(default_factory=...)`, or a pydantic model whose validator mutates shared state, or `BaseModel` fields with mutable defaults shared across instances. **Major**. The dataclass case raises `ValueError` at import; the pydantic case needs `python -m pytest -x -q` on two instances to show the shared object.
8. Module-level mutable state (a dict cache, a list, a client) is written at request or call time, or `logging` calls use f-strings so the message is formatted before the level check and `%`-style arguments are lost. **Minor**; **Major** for module state written from several threads or workers. `ruff check --select G004` flags f-strings in logging; grep `^[A-Z_]+ = (\{|\[|dict\(|list\()` at module scope for the state.
9. Money or quantities use `float` or mix `Decimal` with `float`, or integer division changes semantics (`/` vs `//`) on an amount. **Major**. Follow the value to its source and cite the type at construction; `Decimal(0.1)` and `Decimal("0.1")` are different numbers.

### Idioms a reviewer should expect

- `pathlib.Path` over `os.path` string joins in new code; `/` over manual separators.
- `enumerate`, `zip`, comprehensions and `dict.get`/`setdefault` over index loops and `if k in d` guards.
- `isinstance` over `type(x) ==`; `is None` over `== None`; truthiness only when emptiness is the intent.
- Specific exception classes defined once per package, caught by type, not by matching message text.
- `logging.getLogger(__name__)` with lazy `%s` arguments; no `print` outside CLI entry points.
- `from __future__ import annotations` or PEP 604 `X | None` consistently with the rest of the tree, not mixed.
- `asyncio.TaskGroup` or `gather(..., return_exceptions=False)` with the results awaited, not fire-and-forget tasks.

### False positives (python)

- `except Exception` at a top-level loop, worker or CLI boundary that logs with `exc_info=True` and continues deliberately is a boundary handler, not a swallowed error.
- A mutable default that is never mutated and used as a read-only sentinel or constant tuple-like value; mention at most as a Nit.
- A missing annotation in a tree that does not run a type checker and does not annotate; match the tree, do not file a Minor per function.
- `time.sleep` inside a function that `asyncio.to_thread` wraps, or in a synchronous worker that only looks like it is near async code.
- Float arithmetic on measurements, ratios or scores that never reach a monetary or index decision.
