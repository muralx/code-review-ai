---
description: One polling tick — discover PRs, queue and run them, clean up, check for updates
---
Polling tick for `{{AGENT_NAME}}`:

1. `cra discover`. For every candidate, while fewer than {{MAX_CONCURRENT}} runs are in
   `reviewing`, `merging` or `delivering`: write the candidate to
   `runs/candidate-<repo>-<number>.json`, `cra run from-candidate --candidate <file>`, then
   `/run <id>`. Leave the rest for the next tick. Log retired and skipped entries in one line
   each only when something changed.
2. `cra retire-clean`. If `company/` is a git clone (not a symlink), refresh it:
   `git -C company pull --ff-only --quiet || true`.
3. If no run is in flight: `cra check-update`. If it printed `updated`, run
   `cra restart-window` and stop. A helper exits this window once only the poll job is running
   (never while a run is in flight), answers Claude Code's dialogs, and `/boot` resumes.
4. `CronList`; if the `/poll` job is missing, re-create it (`*/{{POLL_MINUTES}} * * * *`).
