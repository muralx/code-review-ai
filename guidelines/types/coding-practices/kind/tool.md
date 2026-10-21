### Tool specifics for coding-practices

A tool's correctness is observable only through its process contract: exit status, the two
output streams, what it leaves on disk, and how it behaves when nobody is watching the
terminal.

### Always check (tool)

1. A failure exits 0 (error logged, run continues to a clean exit), every failure exits 1 where
   the documentation lists distinct codes, or an uncaught exception or panic prints a stack
   trace with the runtime's generic status. **Major**. Run each failure path in the diff and
   `echo $?`; compare with the documented codes.
2. Results and diagnostics share a stream: progress, warnings or log lines on stdout, the
   result on stderr, or `--json`/`--quiet` output interleaved with text. **Major** when stdout
   is parsed by a pipeline; **Minor** for a human-only tool. Run with `2>/dev/null` and parse
   what remains.
3. The tool prompts when stdin is not a terminal, emits colour or cursor control when stdout is
   not a terminal with no `NO_COLOR` or `--no-color` honoured, or writes a progress bar to a
   pipe. **Major** for the prompt (a pipeline hangs); **Minor** for the escapes. Run with
   `</dev/null >out.txt 2>err.txt` and read both files.
4. A destructive operation (delete, overwrite, force-push, bulk edit) runs with no confirmation
   and no `--yes`, has no `--dry-run`, or the dry run still writes. **Critical** when the loss
   is irreversible; **Major** otherwise. Run the dry run in a scratch copy and `diff -r`.
5. A second run on the same target fails or duplicates: appends twice, errors on "already
   exists", re-creates what the first run made. **Major**. Run the tool twice on one scratch
   target and diff the result.
6. Configuration precedence differs from the documented flags-over-environment-over-file order,
   or the same key is read in two places with different parsing or defaults. **Major** when a
   flag is silently overridden. Set all three sources to distinct values and observe; grep
   environment reads outside the config loader.
7. Interruption leaves damage: no `SIGINT`/`SIGTERM` handling, output written in place rather
   than to a temp file then renamed, a lock file or temp directory left behind, child processes
   orphaned. **Major**. Kill the tool mid-run and list what remains.
8. A child process's exit status is ignored, its output is read unbounded into memory, or the
   program is located through `PATH` and the error on a missing binary names nothing. **Major**
   for the ignored status; **Minor** otherwise. Read each exec site for the status check.
9. `--help` exits non-zero or prints to stderr, omits a flag the parser accepts, or states a
   default the code does not apply; `--version` is absent or hard-coded instead of set at build
   time. **Minor**; **Major** for a wrong default in `--help`. Run `--help` for each command and
   compare with the flag definitions.

### False positives (tool)

- A tool documented as human-only output with no stable stdout contract: stream mixing is
  **Minor** there.
- A prompt behind an explicit `--interactive` flag, or colour behind `--color=always` or
  `FORCE_COLOR`.
- Exit code 1 for every failure in a tool whose documentation says exactly that.
- A one-shot script with a documented single purpose and no pipeline consumers.
