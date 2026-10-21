#!/usr/bin/env bash
# The coordinator window: update Claude Code, make sure the agent-link plugin is installed, start
# the coordinator, and restart it whenever it exits (an update, /exit from cra restart-window,
# or a crash). All run state is on disk, so a restart is cheap; /boot resumes it.
set -uo pipefail
cd /deployment || exit 1
MARK="${HOME}/.cra-booted"
CHANNEL="plugin:agent-link@agent-link"

ensure_plugin() {
  [[ -d /opt/agent-link/plugin ]] || { echo "[window] no agent-link at /opt/agent-link; running without the channel" >&2; return 0; }
  if ! command -v agent-link-edge >/dev/null 2>&1 && [[ -d /opt/agent-link/node_modules ]]; then
    (cd /opt/agent-link && pnpm link:bins >/dev/null 2>&1) || true
  fi
  # A read-only mount of a host checkout: link:bins cannot chmod there, so link the edge directly.
  if ! command -v agent-link-edge >/dev/null 2>&1 && [[ -x /opt/agent-link/packages/edge/src/bin.ts ]]; then
    mkdir -p "${HOME}/.local/bin" && ln -sf /opt/agent-link/packages/edge/src/bin.ts "${HOME}/.local/bin/agent-link-edge"
  fi
  claude plugin marketplace add /opt/agent-link >/dev/null 2>&1 || true
  claude plugin install agent-link@agent-link --scope user >/dev/null 2>&1 || true
}

while true; do
  echo "[window] $(date -u +%FT%TZ) claude update" >&2
  claude update 2>&1 | tail -1 >&2 || true
  ensure_plugin
  # Every start shows the development-channels notice; answer it in the background (a no-op while
  # `cra restart-window` holds the lock, since that helper answers it itself).
  mkdir -p "${HOME}/.cra"
  "$(dirname "${BASH_SOURCE[0]}")/restart-window.sh" --notice-only >>"${HOME}/.cra/restart.log" 2>&1 &
  if [[ -f "${MARK}" ]]; then
    claude --continue --dangerously-load-development-channels "${CHANNEL}" --dangerously-skip-permissions "/boot" \
      || claude --dangerously-load-development-channels "${CHANNEL}" --dangerously-skip-permissions "/boot"
  else
    claude --dangerously-load-development-channels "${CHANNEL}" --dangerously-skip-permissions "/boot"
    touch "${MARK}"
  fi
  echo "[window] coordinator exited; restarting in 3s" >&2
  sleep 3
done
