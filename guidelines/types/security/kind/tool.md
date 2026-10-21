### Tool specifics for security

The attacker is whoever controls what the tool consumes: arguments, environment, working
directory, the files and repositories it operates on, the pipeline that runs it; and the process
list, shell history and CI log are readable by everyone on the machine or the project.

### Always check (tool)

1. A secret is accepted on the command line (`--token X`), placed on a child process's argv,
   printed in `--help` as a default, or echoed in verbose output, logs or error messages.
   **Critical** on argv (visible to `ps`, shell history and CI logs); **Major** in logs or
   `--help`. Grep flag definitions for secret-like names; run with `--verbose` and a fake secret
   and grep the output; read what each child process invocation receives.
2. A child process is started through a shell with a string built from input (`sh -c`,
   `shell=True`, `child_process.exec`, `Runtime.exec(String)`) instead of an argument array
   with a constant program. **Critical**; **Major** when the array's first element comes from
   input. Grep the exec sites.
3. A path from arguments, config or the processed content is not confined: an output path that
   overwrites outside the target, an archive entry with `..` or an absolute path, a symlink
   followed while writing into a directory. **Critical** for a write; **Major** for a read
   outside the intended root. Run with `../x`, an absolute path and a symlinked target.
4. Temporary files have predictable names in a shared directory, carry a secret or private data
   with a permissive mode, or are not removed on exit and on interruption. **Major**;
   **Critical** for a readable secret. Grep `/tmp` and the temp-file API; `ls -la` during a run.
5. The tool reaches the network with no flag and no documentation (telemetry, update check,
   remote fetch), downloads without a checksum or signature or over plain HTTP, or replaces its
   own binary from an unverified source. **Major**; **Critical** for unverified self-update or
   remote code it then executes. Run with the network blocked and trace the attempts; read the
   update path for the verification step.
6. Content the tool processes is treated as configuration or instructions: hooks or commands
   read from the target repository and executed, plugins or modules resolved from the working
   directory, config files picked up from the processed tree, for an agent or bot text it
   follows as an order. **Critical** when it executes; **Major** when it changes behaviour.
   List every config and extension source and mark which the processed data controls.
7. Files the tool creates are world-readable or writable (`0666`, `0777`, a credentials file at
   the default umask), or a token is persisted in a plain config file where the tree uses a
   credential store. **Major**; **Critical** for a readable credential. Grep creation modes; run
   and `stat` what was written.
8. Output a pipeline consumes contains untrusted content unescaped: newlines in a line-oriented
   format, ANSI escapes from file content, shell metacharacters in output meant for `eval`, a CI
   command built from processed text. **Major**. Feed a newline, `$(id)` and an escape sequence.

### False positives (tool)

- Secrets taken from the environment, a file, or a prompt on a TTY; the variable's name in
  `--help` is documentation, not exposure.
- A tool whose purpose is to run project-defined commands (a task runner, a hook manager) and
  documents it; the finding is undocumented execution, not execution.
- Temporary files with unique names from the platform's secure API and a restrictive mode.
- Network calls that are the tool's documented function; the finding is undisclosed traffic.
