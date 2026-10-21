---
description: Report run status (for a peer, the human, or yourself)
argument-hint: [run id]
---
If `$ARGUMENTS` names a run id, run `cra run show $ARGUMENTS` and summarise: target, status,
types, verdict and posted SHA if delivered, failure if failed. Otherwise run `cra status` and
report the counts and the in-flight runs. Keep it to a few lines; when answering a peer,
reply in their conversation with `final: true`.
