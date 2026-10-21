### Precision

A review is trusted in proportion to how rarely it is wrong. Two real findings beat two real
findings buried under eight opinions.

- **Scope.** Findings are about what the change introduced or altered. Code the diff does not
  touch enters only under the fix-now-or-defer rules above, with the one exception that new code
  routing untrusted data into a pre-existing dangerous sink is a new defect: tag it
  `caused-by-change` and cite both the new line and the sink.
- **The existence test.** Before filing, answer in one sentence: if this ships as is, what
  concretely goes wrong, for whom, under which input or sequence? No sentence, no finding.
- **Disprove first.** For every suspicion look for the guard, invariant, type or call site that
  kills it, on both sides of any changed interface (the unchanged caller that passes the value
  the new signature no longer accepts is still your finding). Report the survivors only.
- **Confidence.** File what you would stake the verdict on. When you are not sure but the harm
  would be data loss, a security hole or money, file it with `verified: false` and say exactly
  what remains uncertain and what would settle it. Otherwise do not file.
- **Narrow triggers.** When the harm needs a specific input, state or environment, say so in
  the one-line statement; do not let a narrow defect read as a general one.
- **Do not file:** anything a formatter, linter or compiler catches (do not run them to find
  it); style, naming and taste unless the tree's own rules state them; missing docstrings,
  type hints or comments on code the change did not touch; "more specific exception type",
  "add validation" or "add error handling" without a demonstrated wrong result; missing tests
  for behaviour the change did not touch; denial of service, rate limiting and resource
  exhaustion without a concrete amplification you can demonstrate; hard-coded non-credential
  configuration (hostnames, ports, project ids, public URLs); development-only fallback secrets
  guarded to non-production paths; a hypothetical that needs a call sequence no caller makes;
  a change the author explicitly silenced with a scoped suppression and a reason.
- **Not filed.** End the prose with a `Not filed` list: each behaviour you considered and set
  aside, one line with the reason (out of scope, disproved by …, could not verify and low
  impact). Keep it under eight lines; an empty list is written as `Not filed: none`.
