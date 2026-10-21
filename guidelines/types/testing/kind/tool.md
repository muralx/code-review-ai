### Tool specifics for testing

A tool is used by a person at a terminal and by a pipeline that parses its output and branches
on its exit code; both are behaviour, and a suite that only calls internal functions has
tested neither.

### Always check (tool)

1. No test runs the tool end to end: the entry point, argument parsing, exit code and output
   are reached only through unit tests of helpers. **Major**. Find a test that invokes the
   binary or the entry function with an argument vector (a subprocess, the framework's command
   runner, a script-based test); none is the finding.
2. Exit codes are not asserted, or asserted as "non-zero" where distinct codes are documented
   or consumed by a pipeline. **Major**. Grep the tests for exit-status assertions; compare
   with the documented codes.
3. Tests capture stdout and stderr together, so a diagnostic leaking into a machine-read stdout
   or a result written to stderr passes. **Major** when stdout is parsed by anything. Read how
   the test captures output; run the tool with `2>/dev/null` and parse what remains.
4. Golden or snapshot output is regenerated in the diff with no account of the delta, or
   normalised so broadly (all numbers, all paths, all whitespace) that it cannot fail. **Major**
   when the regeneration hides a behaviour change. Read the golden diff as if it were
   production output; read the normaliser.
5. The non-TTY path is untested: every test runs through a pipe, so prompts, colour, progress
   and width logic never run, or every test uses a pseudo-terminal so the pipeline path never
   runs. **Minor**; **Major** when a prompt can block a pipeline waiting on stdin. Run the
   binary with `</dev/null` and under `script` or an equivalent pseudo-terminal.
6. Tests read the developer's real environment or home: no isolation of `HOME`,
   `XDG_CONFIG_HOME`, the tool's own variables or the working directory, so results differ by
   machine and a personal config leaks in. **Major**. Grep the tests for the isolation; run the
   suite under `env -i` with only `PATH` set, from a different directory.
7. Precedence of flags over environment over config file has no test per pair, so a silent
   override regresses unnoticed. **Major**. Find the tests that set two sources to different
   values and assert the winner; each pair needs one.
8. A destructive operation's safeguards are untested: `--dry-run` not shown to leave the target
   unchanged, `--yes` not exercised, a declined confirmation not shown to abort. **Major**. Run
   the dry run in a scratch copy and `diff -r` before and after.
9. Re-running is untested: nothing runs the tool twice on the same target and asserts the
   second run changes nothing, or interrupts a run mid-write and checks the target's state.
   **Major** when the tool writes files others consume. Run twice; kill once mid-run.

### False positives (tool)

- Unit tests of the operation layer plus one smoke test of the binary per command; the finding
  is zero end-to-end tests, not a low count.
- A golden regeneration whose delta matches a behaviour hunk and is named in the change.
- Normalising genuinely variable fields (timestamps, temp paths, version strings) only.
- TTY behaviour tested through the tree's own injected terminal abstraction instead of a real
  pseudo-terminal, when the abstraction is the only place the check lives.
