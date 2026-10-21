### Hexagonal-service specifics for code-structure

In a ports-and-adapters tree the path of a file states its ring, so a file in the wrong directory
is a layering claim that is false, and the fakes beside each adapter are part of the layout.

### Always check (hexagonal-service)

1. A file sits in the wrong ring: a port declared inside an adapter package, an adapter inside the
   services package, a transport DTO inside ports, a fake in a global test-utility package instead
   of beside its adapter. **Minor**; **Major** when the placement creates an import edge the
   boundary checker would otherwise reject. Compare each new file's path with its imports and the
   interface it implements.
2. An output port is added or gains a method and no in-memory fake beside the adapter follows, so
   service tests hand-roll a stub each. **Minor**; **Major** when two tests now carry diverging
   stubs. List the ports; list the fakes; diff the method sets.
3. An output port grows a method no service calls (added for the adapter's convenience or for a
   test), or mirrors every method of its one adapter. **Minor**. Grep services for each method of
   the changed port; a method with no service caller is the finding.
4. Names state the wrong thing: a port named for an implementation, an adapter package named for
   the port rather than the backend, a port file whose name does not match the one interface it
   declares. **Minor**. Read the names against the siblings.
5. A port's input or output type carries serialisation or column tags, so a wire or schema rename
   changes the use-case contract. **Minor**; **Major** when the tag already drives a behaviour (a
   wire name read back by a handler). Read the struct tags on types under ports.
6. An implementation is not declared against its port in the language's way (an implements
   clause, a compile-time assertion, a protocol check), so signature drift surfaces at wiring or at
   runtime instead of at compile time. **Minor**. Grep the service and adapter files for the
   declaration the tree's siblings use.
7. The composition root carries logic beyond construct, inject and start: a branch on request
   data, a validation rule, a retry. **Minor**; **Major** when the rule exists nowhere else, so it
   is untestable without the whole graph. Read the root; name each statement that is not wiring.

### False positives (hexagonal-service)

- Grouping adapters by backend and grouping a swappable unit by port with a factory are both valid
  when the tree is consistent.
- A shared fake package the tree already uses for every adapter; match the tree, not the pack.
- A port with one method and one caller: small ports are the idiom, not under-use.
- A root that validates config and refuses to start is doing startup, not business logic.
