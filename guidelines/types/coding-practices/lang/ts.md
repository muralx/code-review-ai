### TypeScript specifics for coding-practices (also applies to JavaScript projects)

TypeScript's guarantees end where `any`, casts and untyped boundaries begin, and the runtime is single-threaded but asynchronous: most real bugs are a promise nobody awaited or a type the compiler was told to stop checking.

### Always check (typescript)

1. `any`, `as unknown as X`, a non-null assertion `!` or `@ts-ignore`/`@ts-expect-error` is used on a value that crosses a boundary (JSON parse, request body, env var, library return). **Major** when a wrong value reaches logic; **Minor** inside a typed internal path. Run `tsc --noEmit` with the repo's config and `eslint` with `@typescript-eslint/no-explicit-any` and `no-unsafe-*` when configured; cite the line and what the value really is at runtime.
2. A promise is created and not awaited, returned or `.catch`ed (floating promise), or an `async` callback is passed where a void callback is expected (`forEach`, event handlers, `setTimeout`), so rejections become unhandled. **Major**. Run `eslint` with `@typescript-eslint/no-floating-promises` and `no-misused-promises` when the repo's config enables them; otherwise grep `async` callbacks and `.then(` without `.catch(` and read each.
3. `strict` (or `strictNullChecks`) is off in `tsconfig.json`, newly disabled, or a changed file opts out with `// @ts-nocheck`. **Major** when the change relies on it to compile. Read the config diff; run `tsc --noEmit --strict` on the changed files and report the first errors.
4. A `switch` or `if` chain over a union is not exhaustive: a new member of a union or `enum` added in the diff has no branch and no `never` check in `default`. **Major**. Add `const _exhaustive: never = value` in a scratch copy and run `tsc --noEmit`; the error names the missing member.
5. `catch (e)` treats `e` as `Error` without narrowing (`e.message`, `e.code`) or rethrows a new error without `cause`, losing the stack. **Minor**; **Major** when the unnarrowed property feeds a decision. With `useUnknownInCatchVariables` (part of `strict`), `tsc --noEmit` fails on the access; otherwise read the handler.
6. `Array.prototype.sort()` without a comparator on numbers or mixed values, or a comparator that returns a boolean, or `sort` relied upon to be stable on an engine that is not guaranteed. **Major** when the order reaches output or a decision. Run the expression in `node -e` with a two-digit number and a one-digit number and cite the result.
7. Dates built from strings without an explicit zone (`new Date("2026-01-01")` is UTC, `new Date("2026-01-01T00:00")` is local), `getMonth()` off by one, or `Date` arithmetic across DST. **Major** when a date reaches storage, billing or a boundary comparison. Run the snippet under `TZ=UTC node -e` and `TZ=America/New_York node -e` and cite the difference.
8. Object identity or equality misuse: `==` instead of `===` with mixed types, `Set`/`Map` keyed by objects expected to compare by value, `JSON.stringify` compared across key orders, `in` on arrays. **Major** when a comparison decides a branch. `eslint` `eqeqeq` catches the first; the rest you read.
9. Node-specific blocking in a request path: `fs.*Sync`, `child_process.execSync`, `JSON.parse` on multi-megabyte bodies, or an unbounded `Promise.all` over a user-sized list. **Major** in a server or worker; **Minor** in a CLI. Grep `Sync(` in non-startup code; name the request path it blocks.

### Idioms a reviewer should expect

- `unknown` plus a type guard or schema parser at every external boundary; `any` only in a declared shim.
- `const` by default, `readonly` on arrays and properties that are not meant to change; `as const` for literal tables.
- String-literal unions over `enum` for serialised values; `enum` only where the tree already uses it or needs reverse mapping.
- `for ... of`, `map`/`filter`/`flatMap`, optional chaining `?.` and `??` over manual null guards and `||` for defaults.
- Named `Error` subclasses with `cause`, not thrown strings or plain objects.
- `Promise.allSettled` or a concurrency limiter when fan-out size comes from input; `AbortController` for cancellable fetches.
- ESM `import`/`export` consistent with the package's `type` field; no mixing `require` into ESM files.

### False positives (typescript)

- `as` casts that narrow a value already validated by a schema parser (`zod`, `valibot`, `io-ts`) on the preceding line.
- A `void somePromise()` with an explicit `void` operator where the tree uses that convention to mark intentional fire-and-forget with its own error handling.
- A `!` assertion right after a check the compiler cannot see (`map.has(k)` then `map.get(k)!`); a Nit at most.
- `enum` in a project whose style guide chooses it, or a `const enum` in an isolated-modules build that already works.
- `==` against `null` used deliberately to match both `null` and `undefined` when the tree lints that pattern as allowed.
