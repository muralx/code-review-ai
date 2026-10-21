### Hexagonal-service specifics for architecture

The tree has opted into ports and adapters: a domain that imports nothing, ports that speak only
domain types, services that implement input ports through output ports, adapters that implement
output ports, and one composition root that knows how everything fits. Each new edge is judged
against that graph, not against taste.

### Always check (hexagonal-service)

1. The domain imports anything beyond the standard library and the tree's declared identity-type
   allow-list: a port, a service, an adapter, a logger, a clock, a request context, a framework.
   **Major**. List the imports of every domain package the diff touches; compare with the boundary
   rules file; one non-allowed import is the evidence.
2. A port signature carries a transport or storage type: a request object, a row or scanner, a
   wire message, a driver error, a status code. **Major**. Read the imports of each changed port
   file; anything outside domain and standard library is the finding.
3. A service imports an adapter or transport package, an adapter imports a service or an input
   port, or a handler or service holds a concrete implementation type where the port is the
   contract. **Major**. Read the struct fields and imports of the touched files; run the tree's
   boundary checker before and after.
4. The boundary rules file gains an allow or exception entry, or a package is moved out of the
   checked set, so the checker passes while the graph gains an edge. **Major**; the added exception
   line is itself the finding, whatever the checker says. Diff the rules file; ask what the edge is
   for and what the port-shaped alternative would be.
5. Backend selection (a switch on a config value choosing an implementation) sits in a service,
   handler or domain rather than in the composition root or an adapter-layer factory. **Major**.
   Grep for the config enum outside the root and the adapters.
6. A domain entity is built by struct literal or setter from a handler or adapter, bypassing the
   constructor that enforces its invariants, or a state transition is decided outside the entity.
   **Major**. Grep for literals of domain types outside the domain; the sanctioned path is a
   constructor, or a reconstitution constructor that still rejects corrupt state.
7. An adapter returns a driver, client or transport error unmapped, so a service or handler
   matches on infrastructure error types, or a second error vocabulary appears outside the domain.
   **Major**. Grep services and handlers for driver or client error imports and for error matching
   against anything but domain sentinels.
8. A service knows transaction mechanics (begins, commits, holds a driver transaction type)
   instead of expressing atomicity through a transactor port. **Major**. Grep services for begin,
   commit, rollback and driver transaction types.

### False positives (hexagonal-service)

- The composition root imports every layer; that asymmetry is the design.
- An identity-type library in the domain that the tree's rules file lists as allowed.
- A factory package in the adapter layer importing config and its sibling implementations, when
  the rules file scopes that edge to the factory.
- Test files crossing boundaries to wire fakes or containers.
- A reconstitution constructor that skips creation validation but rejects unknown state.
