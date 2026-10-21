### Service specifics for code-structure

A service tree has one composition root, one route table, one error mapping and one place for
each cross-cutting concern; the structural findings are a second copy of any of these, or a type
that serves two layers at once.

### Always check (service)

1. A second composition root: a test harness, subcommand or tool wires the dependency graph by
   hand instead of calling the root's builder, so the two drift (a middleware or option present in
   one and not the other). **Minor**; **Major** when the test wiring omits a control the real wiring
   has, so tests pass on a path production never takes. Diff the two construction sequences.
2. One struct serves as wire DTO, domain entity and storage row (serialisation and column tags on
   the same type), so renaming a response field changes the schema. **Minor**; **Major** when the
   tags already disagree with one of the three consumers. Read the tags on types the diff touches;
   count the layers that import each.
3. Routes are registered in several places (inline in a handler file, a second mux, a package
   initialiser) rather than in the tree's single route table, so the coverage test and any audit of
   the surface miss them. **Minor**; **Major** when a route-table test exists and the new route sits
   outside it. Grep for the router's registration method; count the sites.
4. Handler files split by HTTP verb or by layer (`get.go`, `post.go`, `interfaces.go`) where
   siblings split by resource, or one file carries every route. **Minor**. Name the layout the
   siblings follow.
5. Error-to-status mapping done inline in a handler instead of in the tree's one mapping table, so
   two mappings can disagree. **Minor**; **Major** when they already do. Grep for status constants
   written beside error matching outside the mapping file.
6. Generated transport stubs (protobuf, OpenAPI clients, mocks) are hand-edited, or committed
   without a reproducible generator invocation and pinned generator version in the tree. **Minor**;
   **Major** when hand-edited, since regeneration erases the fix. Read the generated header; run the
   generator and diff.
7. A package shares its name with a standard-library or framework package it imports, so every
   file in it aliases the import. **Minor**. Read the package clause and the imports of files in the
   diff.

### False positives (service)

- A small service that is one package by design; do not invent rings for it.
- A test harness that calls the root's builder with options (fakes injected, auth disabled by a
  visible flag) is reuse, not a second root.
- A port's input type shared by two transports (HTTP and gRPC handlers both map into it) is the
  intended single use-case contract.
- Generated code excluded from lint and formatted by its generator, however long.
