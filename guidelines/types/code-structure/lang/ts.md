### TypeScript specifics for code-structure (also applies to JavaScript projects)

TypeScript tolerates import cycles at compile time and resolves them at runtime in load order, path aliases and barrel files make the real dependency graph invisible in the source, and in a monorepo the package boundary is only as real as `package.json` says it is.

### Always check (typescript)

1. The diff introduces an import cycle, directly or through a barrel (`index.ts`) that re-exports both sides, so one module sees `undefined` at load time or `tsc` and the bundler disagree. **Major**. Run `npx madge --circular --extensions ts,tsx src` when available (or `npx dpdm --no-warning --no-tree src`), or `eslint` with `import/no-cycle` when configured; cite both edges. Without tooling, trace the two imports by hand.
2. A barrel file (`index.ts` re-exporting a directory) pulls server-only, heavy or side-effectful modules into consumers that need one small export, or a new barrel is added where the tree imports from files directly. **Minor**; **Major** when a client bundle or a light package now carries a server dependency (database driver, `fs`, a secret-loading module). Read the barrel's export list and who imports it; check the bundle analyser output or `next build` warnings when present.
3. Path aliases (`@/`, `~/`, `#app/`) are declared in `tsconfig.json` `paths` but not in the bundler, test runner or `package.json` `imports`, or a new alias duplicates a relative path convention the tree already uses. **Major** when `tsc --noEmit` passes but `vitest`/`jest`/the build fails. Run both `tsc --noEmit` and `npm test`/`pnpm test` on the touched files; cite the one that fails.
4. In a workspace (`pnpm-workspace.yaml`, npm/yarn `workspaces`), a package imports another by relative path (`../../other-pkg/src/x`) instead of its package name, imports a sibling's internals past its `exports`, or depends on a sibling without listing it in its own `package.json`. **Major**. Read the import and the importer's `package.json`; run `pnpm install --frozen-lockfile` and `pnpm -r exec tsc --noEmit` (or the workspace's `build`) from a clean checkout to see what only works by hoisting.
5. A published package's `package.json` `exports`/`main`/`types` do not match what the diff adds: a new public module not listed in `exports`, a deep import path consumers must use, or `types` pointing at a file the build no longer emits. **Major** for a library consumed outside the repo. Run `npx publint` and `npx @arethetypeswrong/cli --pack .` when available; otherwise `npm pack --dry-run` and read the file list against `exports`.
6. A type is imported with a value import (`import { Foo }` where `Foo` is only a type) in a tree using `isolatedModules`/`verbatimModuleSyntax`, or a `import type` is used for a value, so the emitted JS keeps or drops an import the runtime needs. **Minor**; **Major** when it creates a runtime cycle or a missing module. `tsc --noEmit` reports `verbatimModuleSyntax` violations; `eslint` `@typescript-eslint/consistent-type-imports` when configured.
7. Tests are placed against the tree's convention: a `__tests__/` directory added where siblings colocate `*.test.ts` (or the reverse), test helpers exported from production modules, or a test file matched by the build's `include` glob so it ships in `dist/`. **Minor**; **Major** when test code reaches the published bundle. Compare with one existing example; run `npm pack --dry-run` for the last case.
8. A module mixes runtime targets: Node built-ins (`fs`, `path`, `crypto` without the `node:` prefix check) in a file imported by browser code, `window`/`document` in shared or server code, or `"use client"`/`"use server"` boundaries crossed by an import. **Major**. Grep the import graph of the touched file for `node:`/`fs` and `window`; in Next.js, `next build` names the offending import.
9. A file or component grows past what the tree treats as normal (a `utils.ts` collecting unrelated helpers, a React component past several hundred lines with several unrelated states), or a new module is named for its kind (`utils`, `helpers`, `misc`, `types`) rather than its concept. **Minor**. Measure with `wc -l` against siblings; `eslint` `max-lines`/`complexity` when configured.

### Idioms a reviewer should expect

- Direct imports from the file that defines a symbol inside a package; barrels only at the package's public boundary.
- `import type` for types; `export type { }` in barrels; `verbatimModuleSyntax` or `isolatedModules` on.
- One alias root (`@/` or the package's `imports` map) declared once and mirrored in `tsconfig`, the bundler and the test runner.
- Workspace packages that depend on each other by name with `workspace:*` and consume each other's `exports`, not their `src/`.
- `exports` with `types` first, matching the emitted `dist/` layout; `files` whitelist in `package.json`.
- Colocated `x.test.ts` beside `x.ts`, excluded from the build's `include`, or a single `tests/` directory, matching the tree.
- Feature or domain folders (`billing/`, `auth/`) over kind folders (`controllers/`, `helpers/`, `types/`) once a tree has more than a handful of modules.

### False positives (typescript)

- A cycle that only involves `import type` edges; it is erased at compile time and has no runtime effect.
- A barrel at a package's public entry that re-exports only that package's intended API, in a tree that uses barrels at that one level.
- A relative import across packages inside a build-time-only script or a test that the tree's config clearly scopes to the repo root.
- A large generated file (API client, schema types, i18n table) that is one cohesive artifact; size alone is not a finding.
- `__tests__/` and colocated tests coexisting in a tree whose documented convention distinguishes unit from integration tests by location.
