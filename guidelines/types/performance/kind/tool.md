### Tool specifics for performance

A tool is invoked many times a day, often by a shell completion or a pipeline step that wants
one answer, and it is pointed at inputs the author never sized; startup and scaling are its two
costs.

### Always check (tool)

1. `--help`, `--version` or a trivial subcommand loads everything: imports the whole tree, reads
   config, opens connections, checks for updates. **Minor**; **Major** when the trivial path
   does network or disk I/O or takes long enough to notice at a prompt. Time it; trace imports
   (`python -X importtime`, a bundle or class-load trace) and file and network calls.
2. Inputs of user-controlled size are read whole into memory, or the entire output is built
   before the first byte is written, where streaming is possible. **Major** when the input is
   large by nature (logs, dumps, repositories, archives). Run on an input ten times larger than
   the fixtures and read peak memory (`/usr/bin/time -v` or the platform's equivalent).
3. Parallelism is unbounded or absent: a process or connection per item with no limit, or
   strictly serial I/O over many items where the tree already has a worker pool. **Major** for
   unbounded; **Minor** for serial. Count processes and connections under a large input.
4. Work is repeated per item that could be done once: the same config or file re-read, a
   pattern recompiled per line, a child process spawned per file (`git` per path) where one
   batched call serves. **Major** when the per-item cost is a process or a network call. Count
   `execve` and `open` with a tracer at one and ten times the input; the ratio is the evidence.
5. Output is the bottleneck: unbuffered per-line writes to a pipe, a progress bar redrawn per
   item, log lines formatted and then discarded. **Minor**; **Major** when output dominates the
   profile. Time the run with output to `/dev/null` and to a file.
6. A change to the main loop or a hot path has no before-and-after timing on a fixed input, or
   the documentation claims speed the tree never measures. **Minor**. Run the tool on the same
   input before and after and cite both times.

### False positives (tool)

- A tool whose inputs are small by definition (a config validator, a formatter for one file);
  scaling checks need a realistic large input.
- Runtime startup the tree accepts (a JVM, a Node process); measure the tool's own additions
  over a hello-world in the same runtime.
- Reading a whole input for a format that requires it (a JSON document) when the size is
  bounded by the format's producer.
