### Standards-driven specifics for security

A standard's security-considerations section, and the best-current-practice documents that
accompany it, enumerate the attacks already known against this surface. Read them as a
checklist for the surface the change touches; a mitigation the text names and the code lacks
is a finding before any novel reasoning starts.

### Always check (standards-driven)

1. The change touches a spec-defined surface and a mitigation the standard's
   security-considerations section (or its companion BCP) names for that surface is absent on
   the new path: binding of a nonce or state, issuer or audience match, replay window,
   redirect or callback validation, constant-time comparison. **Critical** when the attack is
   reachable; **Major** when the text says SHOULD. Open the section, list the items that
   apply to the surface, and locate each in the code path the diff creates or changes.
2. A deviation from the standard is justified by interoperability with no named peer
   (implementation and version), no scope limit (flag off by default, per-peer config) and no
   note in the docs. **Major**; **Critical** when it disables a MUST-level protection. Read
   the justification in the change; "some clients" is not a peer.
3. The algorithm, mode or method allow-list differs from the standard's required and
   recommended set: a forbidden or "none"-style algorithm accepted, a deprecated mode kept, a
   mandatory-to-implement entry missing, or the list expressed as a deny-list. **Critical**
   for a forbidden entry; **Major** otherwise. Compare the list with the standard's table or
   registry and cite both.
4. A peer-supplied parameter selects the algorithm, key, verification mode or type before the
   allow-list is applied, or selects it at all where the standard says the receiver decides.
   **Critical**. Trace the parameter from parse to the selection call.
5. Negotiation can settle below the configured minimum, or falls back to a weaker option when
   the stronger one fails, without an error the caller sees. **Critical**. Read the fallback
   branch; run the path with the stronger option made to fail.
6. The code acts on peer-supplied data before the standard's validation order allows it:
   following a redirect before the peer is authenticated, caching a response before its
   signature is checked, honouring a claim before the issuer is verified. **Critical**. Trace
   the order of operations against the sequence the standard prescribes.

### False positives (standards-driven)

- A consideration the standard allows to be met at another layer (transport security instead
  of message-level protection) when the tree documents that choice and the layer is enforced.
- Behaviour stricter than the standard: rejecting an allowed-but-discouraged algorithm or
  requiring a SHOULD is not a finding.
- A deviation with a named peer and version, a gate off by default, and a documentation note.
- Deprecated algorithms or malformed inputs in test fixtures that exist to prove rejection.
