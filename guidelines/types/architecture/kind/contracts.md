### Contracts specifics for architecture

A contracts module is imported by services that deploy on their own schedules; its exported
shapes are the only thing those services agree on, so ownership, dependency direction and what a
consumer inherits by importing it are architecture questions here, not style.

### Always check (contracts)

1. A definition is owned by the wrong side: the consumer of a token, event or RPC edits the shape
   the issuer mints, or a shape has two owners who both edit it. **Major**. Read the ownership
   statement the tree carries (README, package doc, code owners file); the author's team against
   the owner of the touched package is the evidence. No statement at all on a module with more
   than one consumer is **Minor**.
2. The dependency arrow turns around: the module imports a service, a service's internal package,
   or another contract family's heavy generated package, so a consumer that wanted one codec now
   compiles the service. **Major**; **Critical** when it creates a cycle between two
   repositories. List the module's imports before and after; anything outside the module and the
   standard library (or the generator runtime, for generated packages) is the finding.
3. A codec or constants package gains a non-standard-library import. **Major**. Every consumer
   inherits the dependency and its upgrade cadence; the package exists so they do not. Run the
   toolchain's import listing on each hand-written package and diff against the previous
   release; a new third-party import, or a new manifest requirement that is not the generator
   runtime, is the finding.
4. Generated code is edited by hand: a stub under the generator's output directory differs from
   what the generator produces from the committed source. **Critical**: the next regeneration
   silently reverts the edit. Regenerate into a temporary directory and diff; confirm the file
   still carries the generator's banner.
5. One constant has two definitions: a role name, event kind, header name, error code or limit
   declared in the module and again in a consumer, or twice in the module under two packages.
   **Major** when the copies can drift and a wire value depends on them. Grep the string value,
   not the symbol, across the module and the sibling clones; two declaration sites is the finding.
6. A consumer re-implements a codec the module exports (its own verifier, its own envelope
   builder) instead of importing it. **Major**: the copy stops tracking the contract at the next
   change. Grep sibling clones for the wire format's distinctive constants (separator, prefix, key
   names); a second implementation is the finding.
7. Business logic enters the module: a validation that depends on a service's state, a default one
   consumer wanted, a feature flag. **Minor**; **Major** when it forces every consumer to ship the
   behaviour. Read each new function; one that needs anything beyond its arguments does not
   belong to a contract.

### False positives (contracts)

- A generated package importing the generator runtime (protobuf, gRPC, a schema runtime) is the
  point of that package; the stdlib-only rule applies to the hand-written codec packages beside
  it, not to it.
- A type alias that makes two event kinds share one payload is a deliberate single definition,
  not duplication; the hazard it creates (both wire shapes move together) belongs to system-design.
- Validation of the envelope's own invariants (required fields present, timestamp non-zero) is
  contract logic, not business logic; only rules about a service's state are the finding.
- Ownership stated in a sibling design repository rather than in-tree satisfies check 1 when the
  README points to it; cite it rather than asking for a copy.
