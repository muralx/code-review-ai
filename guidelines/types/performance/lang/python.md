### Python specifics for performance

Every Python-level operation per element costs interpreter time, the interpreter lock
serialises CPU-bound threads, and the fast paths live below Python: built-ins, vectorised
libraries and the database doing the work. Most defects are a hot loop doing in Python what
one call could do beneath it.

### Always check (python)

1. CPU-bound work parallelised with threads and presented as a speedup: a thread pool over
   pure-Python computation that never releases the interpreter lock. **Major** when the change
   or its description claims the speedup. Time the path with one worker and with four; no
   improvement is the evidence.
2. Materialising what could stream: `list(...)` around a generator consumed once, `readlines()`
   on a large file, an ORM query fully fetched before a single pass, a whole dataframe loaded
   to filter one column. **Major** when the input is user-sized; **Minor** otherwise. Measure
   peak memory with `tracemalloc` at two input sizes and cite both.
3. An N+1 query through the ORM: a relation touched per row inside a loop with no eager-load
   option on the query (`select_related`, `joinedload`, or whatever the tree's ORM calls it).
   **Major** on a request path. Count statements with the ORM's query counter or SQL echo in a
   test at `n=1` and `n=50`; cite both.
4. CPU-bound work holding the event loop inside `async def`: a long pure-Python loop, a large
   encode, a heavy serializer, with no `to_thread` or process pool. **Major**. Run the tests
   with `PYTHONASYNCIODEBUG=1` and cite the slow-callback warning; synchronous I/O inside
   `async def` as such belongs to **coding-practices**.
5. Per-element Python work in a hot loop where a lower-level path exists: a row-wise loop over
   an array or dataframe, `re.compile` inside the loop, `str +=` building a large string, an
   attribute looked up on every iteration. **Minor**; **Major** when the profile shows the loop
   dominating. Run `python -m cProfile -o out.prof` and cite the cumulative share from `pstats`.
6. A memoizing cache keyed by user input with no bound: `functools.lru_cache(maxsize=None)` or
   a module-level dict filled per request. **Major** in a long-running process. Read the key;
   after a test with many distinct inputs, cite `cache_info()` or the dict's length.
7. The project's benchmarks were not run, or no profile backs the change's hotspot claim.
   **Major** on your own output when not run. Run `pytest --benchmark-only` when the tree uses
   `pytest-benchmark`, otherwise `cProfile` or a sampling profiler such as `py-spy` on a
   representative input; cite the numbers or set `verified: false` and name the command.

### Idioms a reviewer should expect

- Generators and `itertools` over intermediate lists; comprehensions over `for` plus `append`.
- `''.join(parts)` over `+=` in a loop; regexes compiled at module level.
- Column-wise vectorised operations over row loops when an array library is already present.
- Process pools for CPU-bound work; threads or `asyncio` for I/O-bound work.
- Eager loading declared at the query site; `iterator()` or `yield_per` for large scans.
- `__slots__` on classes created in the millions, not everywhere.

### False positives (python)

- Threads around network or disk I/O: the lock is released during the call and the pool scales.
- A comprehension or `list(...)` over a small bounded collection; the materialisation is noise.
- `lru_cache` on a function whose key domain is small and finite (an enum, a config name).
- Cost paid once at import time: compiling regexes, building lookup tables, loading a model.
- A loop whose body is dominated by one C call; the Python overhead around it is not the cost.
