# History

Point-in-time records. They are kept as written and are **not** updated as the system
changes. For how the system works now, read `docs/architecture.md` and the other files in
`docs/`.

| File | What it is |
|---|---|
| `2026-10-11-design.md` | The approved v1 design. It is still the best account of why each decision was made (decisions D1–D11, security model, out-of-scope list). Where it disagrees with `docs/architecture.md`, the architecture doc is right. |
| `plans/2026-10-11-phase1…4-*.md` | The four implementation plans that built v1: resolver and core content; prep, discover and post; coordinator; deployment. They reference the design at its original path, `docs/superpowers/specs/`. |
| `research/2026-10-12-review-frameworks-survey.md` | Survey of public review agents and frameworks that fed the guideline library. |

Changes after the design that matter when reading it:

- Guidelines are composed from a prompt template with explicit include lines; the design's
  section 5.1 records the amendment from the original layered-override model.
- The merger's `review.md` is checked (`post-review --check`) before the run finishes, and the
  merger is re-dispatched once with the check's messages; a second failure fails the run.
- `post-review` refuses to post when the pull request's head moved during the run.
- Claude Code's exit and development-channel dialogs are answered by
  `scripts/restart-window.sh`, so the window restarts unattended.
- Pull-request preparation also saves line comments (`meta/review-comments.json`), and every
  specialist is pointed at the discussion.
- Run directories have no `log/` directory; subagent transcripts stay in Claude Code's own
  session store.
