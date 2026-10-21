### TypeScript specifics for testing (also applies to JavaScript projects)

The runner (vitest or jest) owns module mocking, timers and the event loop; most TypeScript test bugs are a mock hoisted somewhere the author did not expect, a fake timer never advanced, or an async assertion the runner never waited for.

### Always check (typescript)

1. An async test loses its assertions: `expect` inside a `.then` or callback without returning or awaiting the promise, `await` missing before `expect(...).rejects`/`.resolves`, or a `done` callback mixed with `async`. **Major**. Read each test to its last line; run `npx vitest run path` or `npx jest path` with the assertion deliberately inverted and confirm it fails; a test that still passes is the finding.
2. Fake timers are installed (`vi.useFakeTimers()`, `jest.useFakeTimers()`) without `useRealTimers()` in `afterEach`, or a test awaits a promise that resolves on a timer without `advanceTimersByTimeAsync`/`runAllTimersAsync`, so it hangs or passes by timeout. **Major**. Grep the new test files for `useFakeTimers` and check the teardown; run the single file and then the whole suite with `npm test` or `pnpm test` and compare.
3. `fetch`, `axios` or a database client is mocked deep inside the module under test (`vi.mock("./service")`) when the code under test is the service, or when `msw` or a fetch mock at the network boundary already exists in the tree. **Major**. For each `vi.mock`/`jest.mock` name the module it replaces; a mock of a module the diff changed is the finding. Prefer `msw` handlers or a fake `fetch` injected at the boundary.
4. A `vi.mock`/`jest.mock` factory references variables declared outside it that are not hoisted (`vi.hoisted` missing), or a mock is set up in one test and never `mockReset`/`restoreAllMocks`ed, so a later test inherits the implementation. **Major**. Check `vitest.config`/`jest.config` for `restoreMocks`/`clearMocks`; without them, grep `mockImplementation` outside `beforeEach`.
5. Snapshots are added for large rendered trees, serialised objects with ids or dates, or anything updated with `-u` in the diff without a stated cause, so the test asserts "whatever it was" rather than a behaviour. **Minor**; **Major** when a snapshot update in the diff hides a behaviour change. Read the `.snap` diff; a changed snapshot needs the same reason as a changed expected value.
6. UI tests query by implementation (`container.querySelector(".btn")`, test ids on everything) when `@testing-library` is present and `getByRole`/`getByLabelText` would express the user's view, or `fireEvent` is used where `userEvent` is set up. **Minor**. Read the queries in the diff against the component's accessible roles.
7. A published library's types are untested: a changed generic, overload or conditional type has no `expectTypeOf`/`assertType` (vitest) or `tsd` test, so a type regression ships green. **Major** for a library's public types; **Minor** otherwise. Run `tsc --noEmit` over the test directory with `typecheck` enabled in vitest config, or `npx tsd` when present, and cite what exists.
8. Open handles leak out of a test: a server `.listen()` without `.close()` in `afterAll`, an interval, a worker, an unawaited stream. **Major**. Run `npx jest --detectOpenHandles path` or `npx vitest run --reporter=verbose path` and cite the warning; a suite that needs `--forceExit` or `teardownTimeout` to finish is the finding.
9. The suite is run in a mode that cannot fail CI: `vitest` without `run` (watch mode) in a script, `--passWithNoTests` added in the diff, `test.only`/`describe.only`/`it.skip` left in a file. **Major**. Run `eslint` with `no-only-tests`/`vitest/no-focused-tests` when configured, else grep `\.only(`, `\.skip(`, `xit(`, `xdescribe(` in the diff.

### Idioms a reviewer should expect

- `describe` per unit, `it("does X when Y")` sentences, no `test1`/`works` names.
- `vi.fn()`/`jest.fn()` with typed signatures (`vi.fn<typeof fn>()`), not `as any` mocks.
- `beforeEach` builds fresh fixtures; no module-level mutable state shared across tests.
- `await expect(promise).rejects.toThrow(SpecificError)` rather than `try/catch` with `expect` in the catch.
- `msw` handlers or a fake `fetch` for HTTP; a real in-memory or containerised database for persistence tests marked as integration.
- Colocated `*.test.ts` or `__tests__/` matching the tree's existing pattern, picked up by the config's `include` glob.
- `npm test`/`pnpm test` scripts that run `vitest run` or `jest --ci`, never bare `vitest` or `jest --watch`.

### False positives (typescript)

- A `.only` or `.skip` in a file the diff does not touch, pre-existing and tracked; mention as `pre-existing` at most.
- `vi.mock` of a genuine external SDK (payment, email, cloud client) with a typed fake is correct; the finding is mocking the module under test.
- Snapshot tests of small, stable, hand-checked outputs (an error message, a generated config) are fine when the `.snap` is readable in review.
- `setTimeout` in a test that waits for a real worker or child process it started, with an explicit upper bound, in an integration suite.
- A library without type tests when it exports no generics or conditional types; `tsc --noEmit` on the examples is enough.
