### TypeScript specifics for security (also applies to JavaScript projects)

JavaScript objects are open by default and the same code often ships to both server and browser; the typical failure is untrusted structure merged into a trusted object, a string handed to something that executes it, or a server-only secret bundled into the client.

### Always check (typescript)

1. Untrusted JSON is merged into a trusted object by spread, `Object.assign`, lodash `merge`/`defaultsDeep`/`set`, or a recursive hand-written merge without a `__proto__`/`constructor`/`prototype` key guard. **Critical** when the result reaches config, a template or a permission check; **Major** otherwise. Grep the diff for `merge(`, `assign(`, `...req.body`, `...payload`; `npm audit`/`pnpm audit` reports prototype-pollution advisories in the merging library.
2. A query string is built by template literal and passed to `knex.raw`, `prisma.$queryRawUnsafe`, `sequelize.query`, `pg`'s `client.query(string)`, or a Mongo filter is built from a request object (`{ username: req.body.username }` where the value can be `{ $gt: "" }`). **Critical**. Grep for `Raw(`, `raw(`, `$queryRawUnsafe`, `.query(\``; for Mongo, confirm the value is coerced to a string or validated by schema before the filter.
3. A string containing input reaches an executor: `child_process.exec`/`execSync` or `spawn(..., { shell: true })` instead of `execFile`/`spawn` with an argument array; `eval`, `new Function`, `vm.runInThisContext`, `setTimeout(string)`; or a template engine rendering an unescaped user string (`<%-`, `{{{`, `| safe`). **Critical**. Grep the diff for `child_process` imports and read each call's first argument to its source; `eslint` `no-eval`/`no-new-func`/`no-implied-eval` flag the code executors.
4. HTML is assembled from input and assigned to `innerHTML`, `outerHTML`, `document.write`, `dangerouslySetInnerHTML`, `v-html`, or `[innerHTML]` without a sanitiser (`DOMPurify`) in the path; or a URL from input is used in `href`/`src` without a scheme check (`javascript:`). **Critical**. Grep the diff for these sinks; `eslint-plugin-react`'s `no-danger` and `eslint-plugin-no-unsanitized` flag them when configured.
5. `jwt.verify`/`jose.jwtVerify` is called without an explicit `algorithms` list, without `issuer`/`audience` where the tree sets them, with `jwt.decode` standing in for `verify`, or with a secret taken from the token header (`kid` used as a path or URL). **Critical**. Read every verify call and its options object; `decode` is not verification.
6. CORS or CSRF controls are loosened: `cors({ origin: true })` or `origin: "*"` with `credentials: true`, a reflected `Origin` header, Fastify `@fastify/cors` with a function that always returns true, Next.js route handlers or server actions that mutate state without the framework's origin check, Express cookie sessions without `sameSite`/`httpOnly`/`secure`. **Major**; **Critical** when credentials ride along. Diff the middleware registration and the cookie options.
7. A server-only secret reaches the client bundle: a `NEXT_PUBLIC_`/`VITE_`/`REACT_APP_`-prefixed variable holding a private key or token, a secret imported into a file under `app/`, `pages/` or `src/client`, or a `.env` committed with real values. **Critical**. Grep the diff for prefixed names and for `process.env`/`import.meta.env` in client-side files; build and grep the output bundle when the project builds locally.
8. A regular expression built from input, or a nested-quantifier pattern (`(a+)+`, `(\w+\s?)*`) applied to unbounded input, so one request can pin the event loop. **Major**. `eslint-plugin-regexp`/`eslint-plugin-security`'s `detect-unsafe-regex` flag it when configured; otherwise run the regex against a 50 kB pathological input in `node -e` and time it.
9. Dependencies added or bumped in `package.json` have a known advisory, no lockfile entry, an install script, or a look-alike name. **Major** with a concrete concern only. Run `npm audit --omit=dev` or `pnpm audit --prod` and cite the advisory; check the lockfile diff for `hasInstallScript` or `preinstall`.

### Idioms a reviewer should expect

- `crypto.randomUUID()`/`crypto.randomBytes` for tokens; `crypto.timingSafeEqual` for secret comparison; `Math.random` never for security.
- Schema validation (`zod`, `valibot`, `ajv`) on every request body, query and param before use, with unknown keys stripped or rejected.
- Parameterised queries or ORM builders; raw SQL only through tagged templates that bind (`sql\`...\``, `Prisma.sql`).
- `helmet` (or framework equivalents) for headers; `Content-Security-Policy` present where HTML is served.
- `Object.create(null)` or `Map` for user-keyed lookups; `Object.hasOwn` over `in` for key checks.
- `fetch` with an allow-listed host and `redirect: "manual"` or an explicit policy when the URL is derived from input.
- `.env.example` committed, `.env` ignored; secrets read on the server through a typed config module, never through `process.env` scattered across modules.

### False positives (typescript)

- `dangerouslySetInnerHTML`/`innerHTML` fed a constant string or the output of `DOMPurify.sanitize` on the same line.
- `exec` with a fully constant command and no interpolation; a Minor idiom note at most.
- `origin: "*"` on a public, credential-less, read-only API that sets no cookies and accepts no `Authorization` header; confirm before filing.
- `NEXT_PUBLIC_`/`VITE_` variables holding genuinely public values (an analytics write key, a public API base URL, a publishable key the vendor designs for the browser).
- Advisories in `devDependencies` that never ship (`npm audit --omit=dev` is clean); report as Minor with the audit scope stated.
