### Tool specifics for code-structure

A tool's tree is read by someone adding the next command or fixing the one that broke: each
command is found by its name, and the entry point says what the tool is made of rather than
doing the work itself.

### Always check (tool)

1. A new subcommand is added inside another command's file, or inline in the entry point, where
   the tree keeps one command per file or one package per command group. **Minor**. List the
   existing command files; cite the pattern the new one breaks.
2. The entry point (`main`, `__main__`, `bin/`, `cli.ts`) carries logic: file I/O, parsing of
   inputs, formatting, business rules, beyond flag definitions and wiring. **Minor**; **Major**
   when the only way to reach the logic is to run the binary. Count the lines in the entry
   point that are not flag definitions or a call into the operation layer.
3. Output formatting is reimplemented per command: each builds its own JSON, table or colour
   handling instead of the tree's output layer, so `--json` differs between commands for the
   same data. **Minor**; **Major** when two commands render one type differently. Grep the
   serialisation calls across command files.
4. More than one place reads the environment or the config file; precedence is applied
   separately in several commands. **Major** when the implementations disagree. Grep
   environment and config-file reads outside the config module.
5. Exit codes are scattered literals (`exit(3)`) with no single named set, or two commands use
   one code for different meanings. **Minor**; **Major** for the clash. Grep exit calls with
   numeric literals.
6. A script has outgrown being a script: hundreds of lines, functions, its own argument parsing,
   no tests, while the tree has a tool structure to hold it; or the same helper is copied into
   several scripts. **Minor**; **Major** when the copies diverge on a correctness rule. Grep a
   distinctive line of the helper across the scripts directory.
7. Long resources are string literals in code: prompt templates for an agent, shell completion
   scripts, help pages, file templates, where the tree keeps them as files or embedded assets.
   **Minor**: they cannot be diffed, linted or reviewed as what they are. Grep multi-line
   string constants in command files.
8. The manifest's entry declaration (`[project.scripts]`, `bin`, `cmd/<name>`, a main class)
   points at a module that does not exist or has moved, or several entries exist for one tool.
   **Major** when the installed command does not run. Install into a scratch prefix and run it.

### False positives (tool)

- A single-command tool or a one-file script by design; layers it never had are not missing.
- Several thin commands in one file when each is an alias or variant of one operation.
- A script that calls the tool's library rather than duplicating it.
- A short inline template whose only reader is the code beside it.
