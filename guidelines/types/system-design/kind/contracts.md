### Contracts specifics for system-design

Nothing here runs; every defect surfaces in production between two versions of two other
services, during the window in which both deploy. The general additive-change check is not enough:
each codec has its own rule for what "additive" does on the wire, and there may be no CI to run
the breaking-change check for you.

### Always check (contracts)

1. For the whole deploy window, an old consumer cannot read what a new producer writes, or a new
   consumer cannot read what an old producer still emits, and the change does not state the
   rollout order. **Critical**. For each changed shape, fill the four cells (old/new producer by
   old/new consumer) from the decoder's source, not from the change description; name the
   consumer file in the sibling clone that fails in each failing cell.
2. "Additive" is argued for a codec whose decoder rejects unknown fields (strict unmarshal,
   disallow-unknown, a closed schema). **Critical**. A new optional field then makes every
   already-deployed verifier reject the new token or message as malformed; it needs a new key id,
   version or contract revision and a verifier-first rollout. Read the decoder construction for
   each changed shape before accepting any additive argument.
3. A signature or MAC covers serialized bytes and the change alters what those bytes are: field
   order in a struct whose encoder preserves declaration order, a field added or removed, the
   separator, the base64 variant or padding, or whether the MAC is computed over the raw payload
   or over its encoded string. **Critical**: every in-flight token fails. Read the sign and verify
   functions together; cite the line that defines the signed input.
4. Key rotation is positional (no key id in the token; verify tries a key list in order) and the
   change reorders the list, drops the previous key before the token lifetime elapses, or adds a
   key id on one side only. **Critical**: live sessions mass-invalidate. Read the verifier's key
   loop and the rotation overlap the tree documents.
5. A version field gains a value with no stated semantics for both halves: what a producer emits
   at the new version, and what a verifier does with each older version (including normalizing
   fields the old version lacked). **Major**; **Critical** when the old-version branch is removed
   while old tokens or messages are still live. Grep the version constant; every switch on it must
   handle the old value.
6. Protobuf or IDL evolution breaks the wire: a field number reused or reassigned, a type or label
   changed, an enum value renumbered, a removed field or value without `reserved` for both number
   and name, or a renamed package, service or RPC (the method path and import path change).
   **Critical** for reuse, retype, renumber and rename; **Major** for a removal without
   `reserved`. Run the project's breaking check against the previous tag when it has one
   (`buf breaking --against`); otherwise diff the schema and check removed numbers by hand.
7. An event kind string changes while it is also the routing subject or topic, so messages from
   the new producer dead-letter at old consumers, or the reverse. **Critical**. Grep the old string
   in the sibling clones' subscriptions and route tables.
8. Routing by event class changes: an event moves between a token-bearing and an ordinary class,
   so it lands in a stream with the wrong encryption or retention. **Critical** when a
   secret-bearing payload reaches the long-retention or unencrypted stream. Diff the
   classification function or set and name the stream each changed kind now reaches.
9. A golden fixture is edited. A golden is a frozen wire snapshot; editing it asserts a contract
   change. **Critical** when the edit only makes a failing test pass; otherwise require the
   matching struct change, a version bump and a stated rollout. Diff the golden bytes and map each
   changed byte to a hunk in the encoder. Shapes without a golden get more scrutiny, not less.
10. One struct serves two wire shapes (a type alias, an embedded payload) and the change edits it
    under one name, so the other wire shape moves silently. **Critical**. Grep the type for aliases
    and embeddings before judging the hunk; name every kind whose bytes change.

### False positives (contracts)

- A new field in a codec whose decoder ignores unknown fields, with no signature over the
  serialized bytes and no consumer that switches on field count, is additive; confirm all three
  from source, then say so.
- A new RPC, message or enum value appended at a fresh number is additive under the IDL's rules;
  a version bump that ships both producer and verifier branches, verifier first, is the correct
  shape of a wire change.
- Reformatting a golden file (whitespace, key order) is a wire change only if the test compares
  bytes; read the comparison before filing.
