### Python specifics for security

Python's standard library will happily shell out, unpickle and format anything you hand it; the dangerous call is usually one import away from a safe one with a similar name (`yaml.load` vs `safe_load`, `subprocess` with `shell=True`, `pickle.loads`).

### Always check (python)

1. SQL is built with f-strings, `%` or `.format` and passed to `cursor.execute`, `text()`, `.raw()` or `RawSQL`, instead of bound parameters. **Critical**. Grep the diff for `execute(f"`, `execute("..." %`, `text(f"`, `.raw(f"`; run `bandit -q -r <paths>` when available (B608) and cite the line. A dynamic identifier must come from an allow-list, never from the request.
2. `subprocess.*`, `os.system` or `os.popen` is called with `shell=True`, or with a command string joined from input, or with a list whose first element is itself user-controlled. **Critical** when any part comes from outside the boundary; **Major** for `shell=True` on constant commands. `bandit` B602/B605/B607 flags it; read where the arguments come from.
3. Untrusted bytes reach `pickle.loads`, `marshal.loads`, `shelve`, `yaml.load` without `SafeLoader`, `jsonpickle`, or `eval`/`exec` on a string. **Critical**. Grep the imports; `bandit` B301/B302/B506/B307 covers these. The fix is a different format, not a wrapper.
4. A filesystem path is built from a request value with `os.path.join`, `Path(...) / name` or `open(base + name)` and not checked after `Path.resolve()` against the intended root with `is_relative_to` (3.9+) or `commonpath`. **Critical**. Trace the name from the handler; a leading `/` in `join` discards the base, and `..` survives `join`.
5. `requests`/`httpx`/`urllib` calls have no `timeout=` or set `verify=False`, or an `ssl` context disables hostname checking. **Major** for no timeout (it is also a denial-of-service vector); **Major** for `verify=False` on a production path. `ruff check --select S501,S113` (bandit rules) and `bandit` B501/B113 flag both.
6. A secret is read from source or a committed `.env`, `settings.py`, `config.toml` instead of the environment or a secret store, or `os.environ.get("SECRET", "default")` ships a working default. **Critical** in source; **Major** for a working default. Grep for `SECRET`, `TOKEN`, `PASSWORD`, `API_KEY` assignments and `.env` files in the diff; never quote the value.
7. Jinja2 is instantiated with `Environment()` without `autoescape=True` or `select_autoescape`, a template receives `Markup`/`| safe` on user content, or Django uses `mark_safe`/`format_html` with an unescaped argument. **Critical** when the content is user-supplied. `bandit` B701/B703 flags the environment; read each `| safe` and `mark_safe` argument to its origin.
8. Framework controls skipped: Django `@csrf_exempt`, `DEBUG = True` reachable in production settings, `ALLOWED_HOSTS = ["*"]`, a view without `login_required`/permission class; FastAPI route without the tree's auth `Depends(...)`; Flask route missing the tree's `@login_required` or with `app.run(debug=True)`. **Critical** when the route exposes data or mutation; **Major** for debug and host settings. List every new route decorator in the diff and name its guard; grep settings for `DEBUG`.
9. Dependencies added or bumped in `pyproject.toml`, `requirements*.txt`, `poetry.lock`, `uv.lock` have a known advisory, no pinned hash, or a look-alike name. **Major** with a concrete concern only. Run `pip-audit` (or `pip-audit -r requirements.txt`) when available and cite the advisory id; check the package name against the import it is meant to provide.

### Idioms a reviewer should expect

- `secrets.token_urlsafe`/`token_bytes` for tokens; `random` only for non-security purposes; `hmac.compare_digest` for secret comparison.
- `hashlib` with `pbkdf2_hmac`/`scrypt`, or `argon2`/`bcrypt`, for passwords; never a bare `sha256` of a password.
- `yaml.safe_load`, `json.loads` with a size cap at the edge, `defusedxml` for XML from outside.
- `subprocess.run([...], check=True, timeout=...)` with a list and no shell.
- Pydantic models or framework serializers at the request boundary that reject unknown fields (`extra="forbid"`) where strictness matters.
- `tempfile.mkstemp`/`NamedTemporaryFile` over `mktemp` or predictable paths in `/tmp`.
- Settings loaded once from the environment via `pydantic-settings`, `environ`, or `os.environ`, with no working defaults for secrets.

### False positives (python)

- `shell=True` with a fully constant command string and no interpolation; a Minor idiom note at most.
- `pickle` used for an internal cache or IPC between processes the service itself spawns, with the file not writable by others; confirm the writer before filing.
- `verify=False` or `DEBUG=True` inside a test module, a local-only settings file the tree clearly separates, or a fixture.
- `eval` of literals through `ast.literal_eval`; it is not `eval`.
- An f-string query whose only interpolations are constant identifiers chosen from a hard-coded mapping, not from input.
