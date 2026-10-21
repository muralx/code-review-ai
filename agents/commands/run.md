---
description: Process one run end to end (prepare, specialists, merger, finish, post, deliver)
argument-hint: <run id>
---
Process run `$ARGUMENTS` exactly as the "Processing a run" section of CLAUDE.md says:
`cra run prepare`, dispatch every specialist in parallel with the model and effort from
`dispatch.json`, record usage, enforce the token cap, dispatch the merger, check `review.md`
(`post-review --check`, one merger re-dispatch on failure), `cra run finish`,
`post-review` when posting is enabled, then deliver the verdict line, counts, and the
`review.md` path to the requester (or to `{{NOTIFY_PEER}}` for a polled run).
