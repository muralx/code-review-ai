#!/usr/bin/env bash
# Runs as `reviewer`. Keeps the coordinator window alive inside tmux and keeps the container up.
set -euo pipefail
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export TERM="${TERM:-xterm-256color}"
cd /deployment

# gh reads GH_TOKEN by itself; plain git does not. The first clone goes through gh, every later
# fetch in that clone is git, so register gh as git's credential helper (idempotent).
gh auth setup-git --hostname github.com --force >/dev/null 2>&1 || echo "[supervisor] could not register gh as git's credential helper; fetches of private repos will fail" >&2

if ! tmux has-session -t coordinator 2>/dev/null; then
  tmux new-session -d -s coordinator -x 220 -y 50 "${HERE}/window-loop.sh"
fi
echo "[supervisor] coordinator window up; attach with: docker compose exec -u reviewer reviewer tmux attach -t coordinator" >&2
while tmux has-session -t coordinator 2>/dev/null; do sleep 5; done
echo "[supervisor] coordinator window gone; exiting" >&2
