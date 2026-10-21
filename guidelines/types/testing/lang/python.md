### Python specifics for testing

pytest resolves fixtures by name and scope, patches by import path, and discovers tests by importing modules; most Python test bugs are a fixture that lives too long, a patch applied where the name is defined instead of where it is used, or a module-level side effect that runs at collection time.

### Always check (python)

1. A fixture with `scope="module"` or `"session"` returns a mutable object that a test mutates, so later tests see the leftover state. **Major**. Read every fixture the new tests use and its scope; run the test file with `python -m pytest -x -q -p no:randomly path/to/test_file.py` and then with `-p randomly` or `--reverse` when the plugin is present; a result that depends on order is the finding.
2. `unittest.mock.patch` or `monkeypatch.setattr` targets the module that defines the name (`patch("requests.get")`) while the code under test imported it with `from requests import get`, so the real function still runs. **Major**. Read the import in the module under test; the patch path must be `module_under_test.get`. Prove it by breaking the mock's return value and running `python -m pytest -x -q` on the test.
3. A `patch` is applied with `start()` and never `stop()`ed, or as a class decorator on a class with setup logic, or with `monkeypatch` from a module-scoped fixture, so it leaks beyond its test. **Major**. Grep the new tests for `.start()` without a matching `stop()` or `addCleanup`; prefer the context-manager or `monkeypatch` form.
4. Tests write to the working directory, `/tmp` by literal path, or the user's home instead of `tmp_path`/`tmp_path_factory`, or read an environment variable without `monkeypatch.setenv`/`delenv`. **Major**. Grep the new tests for `open(`, `os.environ[`, `Path(".")`, `"/tmp"`; run the file twice in a row and once from a different cwd.
5. An `async def` test has no `@pytest.mark.asyncio` (or `asyncio_mode = auto` in config) and so is collected but never run, or it awaits nothing and its assertions are inside a coroutine that is never awaited. **Major**. Run `python -m pytest -x -q -W error::RuntimeWarning` on the file; a "coroutine was never awaited" warning or a `PytestUnhandledCoroutineWarning` is the evidence.
6. A test that depends on the clock uses `time.sleep`, compares against `datetime.now()` or `date.today()`, or patches `datetime.datetime` directly instead of using `freezegun`/`time-machine` when present or injecting a clock. **Major**. Grep for `now()`, `today()`, `time.time(` in test bodies; run the test under `faketime` or with `TZ=` changed when the project has no time control library.
7. A `conftest.py` is added at the repo root or inside the package under test instead of the tests directory, or a fixture is redefined in a nested `conftest.py` shadowing a shared one with a different meaning. **Minor**; **Major** when the shadow changes what an existing test sets up. Run `python -m pytest --fixtures -q path/` and cite the two definitions.
8. Importing the module under test triggers side effects at collection (network call, DB connection, reading a required env var, `logging.basicConfig`), so the whole session fails or depends on the environment. **Major**. Run `python -m pytest --collect-only -q` in a clean environment and cite the collection error or the connection attempt.
9. Several near-identical test functions differ only in input and expected value where `@pytest.mark.parametrize` with `ids=` would state the cases, or a parametrize uses opaque ids so a failure reads `test_x[3]`. **Minor**. Read the names pytest prints with `--collect-only -q`.

### Idioms a reviewer should expect

- Fixtures over `setUp`/`tearDown` classes in a pytest tree; `yield` fixtures for teardown rather than `request.addfinalizer` unless ordering matters.
- `pytest.raises(SpecificError, match=r"...")` over asserting on a caught exception's string, and over bare `pytest.raises(Exception)`.
- `tmp_path`, `monkeypatch`, `capsys`/`caplog` built-ins rather than hand-rolled equivalents.
- `pytest.approx` for floats, never `==` on computed floats.
- Factories or `@pytest.fixture` builders for domain objects rather than copied literal dicts across tests.
- `python -m pytest -x -q` (or `--maxfail=N`) as the local loop, with `-p no:randomly`/`-p no:cacheprovider` used only to reproduce ordering, never committed to `pytest.ini`/`pyproject.toml`.
- `respx`/`responses`/`httpretty` or an injected client for HTTP, not a mocked `requests.get` deep in the call stack.

### False positives (python)

- A session-scoped fixture that returns an immutable value or a read-only connection pool, documented as shared.
- `patch` on the defining module is correct when the code under test calls `module.name` through the module object rather than an imported name; read the import before filing.
- `time.sleep` in a test that waits for a real subprocess or thread the test itself started, bounded by a timeout, in an integration test marked as such.
- Tests that import a module with side effects guarded by `if __name__ == "__main__":`; the guard is the fix, not a finding.
- A `conftest.py` at the repo root in a tree whose documented layout puts shared fixtures there (common with `src/` layout plus a top-level `tests/`).
