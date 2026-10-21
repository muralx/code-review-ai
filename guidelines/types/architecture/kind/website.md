### Website specifics for architecture

In a browser app the user is the inbound actor and the UI is an adapter. The layering to judge
against: a pure core (no DOM, no network), use-cases over ports, adapters that hold the network
and browser APIs, presentational components fed by props, one composition root. Server state
lives in the query layer; a second copy of it is the common failure.

### Always check (website)

1. The core or domain layer imports the view framework, the DOM, the network or a storage API, or
   a port signature carries a transport type (a response object, a DTO, a status code). **Major**.
   List the imports of each core and port file in the diff; a framework, `fetch` or `window`
   import, or a DTO in a port, is the finding. Run the tree's import-boundary tool when it has one.
2. A component, hook or route loader calls the network directly or imports an adapter or the
   generated client, bypassing the use-case seam and the client wrapper's error mapping,
   cancellation and instrumentation. **Major**. Grep the UI directories for `fetch(`, the client
   module and adapter paths; compare with how sibling hooks reach data.
3. Server-owned data is copied into a client store: a response written into a global store, a
   store hydrated from a query result, so two sources of truth with hand-rolled staleness exist.
   **Major** when a mutation updates one copy and not the other; **Minor** otherwise. For each
   store write in the diff trace the value's origin; a response means the query layer holds it.
4. Derived state is stored: a filtered list, a total, a validity flag kept in state and updated by
   an effect instead of computed from its inputs at render or through a selector. **Minor**;
   **Major** when an updater in the diff misses one input. For each new state field ask whether
   it is a function of other state; grep for effects whose body is `setX(f(y))`.
5. A browser global (`window`, `document`, `localStorage`, `navigator`, `matchMedia`) is read from
   the application layer, a store initialiser or module top level in code that also runs on the
   server, with no adapter and no guard. **Major** when the tree has a server render (it
   crashes); **Minor** in a browser-only tree (untestable without a DOM). Grep for the globals
   outside adapters and UI hooks; check for a server entry; run the server build.
6. Wiring outside the composition root: an adapter or client constructed inside a component or
   hook, a second query client, router or telemetry provider instantiated in a feature module,
   environment read outside the validated config module. **Major** when two instances can
   disagree (two caches, two tracers); **Minor** otherwise. Grep for the constructors and for
   `import.meta.env`/`process.env` outside composition and config; count instances.
7. A business rule (validation, derivation, permission logic) lives only in a component or a form
   schema, or the form schema and the core schema each state it so they can drift. **Minor**;
   **Major** when the two copies already differ. Find the schema the form resolver uses and the
   core schema; diff the constraints; a rule testable only by rendering is the finding.

### False positives (website)

- Observer hooks (intersection, resize, media query) written as UI hooks are UI mechanics, not
  adapters; the rule targets state and I/O.
- A use-case that passes straight through to the gateway is the seam, not needless indirection;
  the general one-implementation rule yields to the tree's port convention.
- Local component state and URL state in the router are not client stores; the server-state rule
  concerns fetched data. The composition root importing every layer is the pattern.
- A route loader that prefetches through the query client into a use-case is in-layer; one that
  calls `fetch` is check 2.
