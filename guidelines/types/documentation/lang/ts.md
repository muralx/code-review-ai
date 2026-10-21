### TypeScript specifics for documentation

A TypeScript consumer reads the emitted declaration file and the editor's hover text, not
`src/`; TSDoc on an exported declaration is that hover text, and the `exports` map in
`package.json` is the list of what can be imported at all.

### Always check (ts)

1. An exported declaration has no TSDoc, or TSDoc whose `@param` names do not match the
   signature. **Minor**; **Major** on a published package's entry point. Run
   `eslint-plugin-tsdoc` or `typedoc --treatWarningsAsErrors` when configured; otherwise
   build with `declaration: true` and read the `.d.ts` for the symbol.
2. A deprecated export has no `@deprecated` tag (so editors do not strike it through), or the
   tag names no replacement and no removal version; or the changelog deprecates a symbol the
   tag does not. **Minor**; **Major** when the replacement is not exported. Grep the
   emitted `.d.ts` for `@deprecated` against the changelog's list.
3. A symbol marked `@internal` still appears in the emitted declaration file (`stripInternal`
   off, or the project's API extractor not run), or a documented public symbol is missing
   from it because the entry point does not re-export it. **Major**. Build and grep the
   `.d.ts`; the declaration file, not `src/`, is the surface.
4. A README example does not type-check against the built package: a symbol not exported, a
   changed signature, an import style (`import` versus `require`, a subpath) the package does
   not provide. **Major**. `npm pack` the tree, install the tarball in a scratch project,
   paste the snippet, run `tsc --noEmit` under the `moduleResolution` the README implies.
5. The `exports` map and the docs disagree: a documented subpath absent from `exports`, an
   exported subpath without a `types` condition, or a documented import that resolves under
   one resolution mode and not the other. **Major** when the documented import fails. Run
   `node -e "import('pkg/sub')"` and a `tsc` resolution check for each documented entry.
6. TSDoc on an overloaded function sits on the implementation signature only, which is not
   emitted; or JSDoc type annotations (`@param {string}`) repeat and drift from the TS types.
   **Minor** for overloads; **Nit** for repeated types. Read the `.d.ts` for the overload docs.

### Idioms a reviewer should expect

- `/** */` TSDoc with `@param name - description`, `@returns`, `@throws`, `@example`,
  `@remarks`; no type braces, the types are in the signature.
- `@deprecated Use X instead; removed in v3.` on the declaration, visible in editors.
- `@internal` paired with `stripInternal` in `tsconfig.json`, or an API report tool.
- Docs on each overload signature; the implementation signature's comment is dropped.
- `exports` entries with `types` listed first in each condition block.
- `typedoc` or an equivalent generating the reference from the entry point.

### False positives (ts)

- Non-exported helpers and re-exports whose source declaration carries the TSDoc.
- Symbols exported for tests under `@internal` when `stripInternal` is on and the `.d.ts`
  proves they are absent.
- A README that shows only ESM imports for a package whose `exports` map is ESM-only and
  whose README says so.
- Examples that need a browser or a service the environment lacks: `verified: false`, command named.
