---
description: Boot the coordinator — register on agent-link, arm the poll, resume unfinished runs
---
Boot sequence for `{{AGENT_NAME}}` in workspace `{{WORKSPACE}}`:

1. Call `register` with name `{{AGENT_NAME}}`, description "Autonomous code-review agent for
   {{COMPANY_NAME}}: reviews pull requests, audits repositories or paths, reviews local
   working trees without publishing, re-reviews when requested again, reports run status and explains
   findings. Runs specialists per review type and posts verdicts as the review bot.",
   capabilities "review a PR (owner/repo#N), audit a repo (owner/repo@ref [paths]), review a
   local tree (local:/path [ref, paths]), re-review, status of a run, explain a finding".
2. `CronList`; if no job runs `/poll`, `CronCreate` cron `*/{{POLL_MINUTES}} * * * *`
   prompt `/poll`.
3. `cra status`; resume every run that is not done, failed or blocked as the CLAUDE.md boot
   section describes; check blocked runs for answered conversations.
4. Send one line to `{{NOTIFY_PEER}}` (expectation `none`): booted, runs resumed, poll armed.
