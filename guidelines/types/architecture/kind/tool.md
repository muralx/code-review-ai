### Tool specifics for architecture

A tool has two consumers of its design: the person or pipeline invoking it, and the test or
other command that needs to run the same operation without a process. The seam between parsing
and doing is what makes the second one possible.

### Always check (tool)

1. Parsing and operation are one unit: the command handler parses flags and then does the work,
   calls `exit` or prints inside the logic, or the parser's object is the only input to the
   operation. **Major**: the operation cannot run from a test, another command or a library
   consumer. Find the function that does the work; its inputs must be plain values or an
   options type, its results returned, its writers injected.
2. The operation reads the process environment directly: working directory, environment
   variables, stdin, global stdout, the clock, deep in the logic rather than at the entry point.
   **Major**. Grep `Getwd`, `Getenv`, `process.env`, `os.environ`, `System.getenv`, `os.Stdin`
   and `now()` outside the entry and config layers.
3. Dry run is a second implementation: `if dryRun { print } else { do }` at each site rather
   than one plan the executor applies or prints, so the two paths drift. **Major**. Read the
   dry-run path; count the branches on the flag.
4. Side effects (filesystem, network, child processes, remote APIs) have no seam a test can
   replace: calls to the global filesystem or a bare HTTP client from inside the operation.
   **Minor**; **Major** when the existing tests therefore need a network or a real repository.
   List the effect sites and what, if anything, abstracts them.
5. Machine-readable output is ad hoc: `--json` serialises an internal struct or a map built in
   the handler rather than a declared output type, so a refactor changes the shape pipelines
   parse. **Major** when a consumer exists or the format is documented. Find the type behind
   the output; an anonymous map or an internal model is the finding.
6. Another tree imports the tool's internals because no library surface exists: a sibling clone
   mounted for the review imports the tool's internal packages or vendors its files. **Major**
   when such an importer exists. Grep the sibling clones for the tool's import path.
7. An extension mechanism (plugins, hooks, providers, an agent's tool set) is reached through a
   concrete type or a dynamic import with no versioned interface, or a single provider is
   hard-wired where a second is already planned in the tree. **Minor**; **Major** for the
   planned second case. Read the extension point and count implementations.

### False positives (tool)

- A one-shot script with no tests and no second caller; separating layers it never had is
  invention.
- Environment and working directory read once at the composition root and passed down.
- A dry-run flag threaded through one executor that logs instead of acting: one path, not two.
- A `--json` output that serialises a type the tool documents as its output schema.
