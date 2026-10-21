#!/usr/bin/env bash
# Restart the coordinator window: type /exit into it, then answer the two dialogs Claude Code
# shows on the way, which nothing else answers in an unattended window:
#   - "Background work is running": exit only when the poll job is all that would stop (the new
#     window's /boot re-creates it). When a subagent or anything else is listed, choose Stay,
#     wait, and try again later; a restart never kills a review in flight.
#   - the development-channels notice of the new window, which window-loop.sh starts with
#     --dangerously-load-development-channels on purpose.
# Started detached by `cra restart-window`, because the coordinator often calls it from its own
# turn: the /exit it types only runs when that turn ends. Log: ~/.cra/restart.log.
# `--notice-only` skips the exit and only confirms the notice: window-loop.sh runs it before
# every start (the first one, and restarts after a crash).
set -uo pipefail

SESSION="${CRA_TMUX_SESSION:-coordinator}"
POLL_S="${CRA_RESTART_POLL_S:-2}"          # pane check interval
EXIT_WAIT_S="${CRA_RESTART_EXIT_WAIT_S:-900}"  # how long the current turn may run before /exit takes effect
RETRY_S="${CRA_RESTART_RETRY_S:-300}"       # wait after choosing Stay before trying again
MAX_TRIES="${CRA_RESTART_MAX_TRIES:-24}"    # Stay retries before giving up (about two hours)
BOOT_WAIT_S="${CRA_RESTART_BOOT_WAIT_S:-600}"  # claude update plus start of the new window

log() { echo "[restart-window] $(date -u +%FT%TZ) $*" >&2; }
pane() { tmux capture-pane -p -t "${SESSION}" 2>/dev/null; }
keys() { tmux send-keys -t "${SESSION}" "$@"; }

# What the exit dialog says would stop: the lines between its header and the first option.
stopping() {
  awk '/will stop when you exit:/ {on=1; next} /1\. Exit and stop tasks/ {on=0} on && NF' <<<"$1" \
    | sed 's/^[[:space:]]*//'
}

# 0 when every listed item is a scheduled task; 1 when anything else (a subagent, a shell) is listed.
only_scheduled() {
  local items
  items="$(stopping "$1")"
  [[ -n "${items}" ]] || return 1
  ! grep -qv '^scheduled task' <<<"${items}"
}

# Wait for the exit dialog or for the window to go away (no dialog: nothing was running).
# Prints "dialog", "gone" or "timeout".
await_exit() {
  local deadline=$(( SECONDS + EXIT_WAIT_S )) p
  while (( SECONDS < deadline )); do
    p="$(pane)"
    if grep -q 'Background work is running' <<<"${p}"; then echo dialog; return; fi
    if grep -q 'Bye!' <<<"${p}" || grep -q 'coordinator exited; restarting' <<<"${p}"; then echo gone; return; fi
    sleep "${POLL_S}"
  done
  echo timeout
}

# Confirm the development-channels notice when the new window shows it.
await_channel_notice() {
  local deadline=$(( SECONDS + BOOT_WAIT_S ))
  while (( SECONDS < deadline )); do
    if grep -q 'I am using this for local development' <<<"$(pane)"; then
      keys Enter
      log "confirmed the development-channels notice; /boot resumes"
      return 0
    fi
    sleep "${POLL_S}"
  done
  log "no development-channels notice within ${BOOT_WAIT_S}s; check the window"
  return 1
}

main() {
  mkdir -p "${HOME}/.cra"
  exec 9>"${HOME}/.cra/restart.lock"
  flock -n 9 || { log "another restart is already in progress"; exit 0; }
  tmux has-session -t "${SESSION}" 2>/dev/null || { log "no tmux session ${SESSION}"; exit 1; }
  if [[ "${1:-}" == --notice-only ]]; then await_channel_notice; exit; fi

  local try=1 state p
  while (( try <= MAX_TRIES )); do
    keys /exit Enter
    log "sent /exit (attempt ${try})"
    state="$(await_exit)"
    case "${state}" in
      gone) break ;;
      timeout) log "the window neither exited nor asked within ${EXIT_WAIT_S}s; giving up"; exit 1 ;;
      dialog)
        p="$(pane)"
        if only_scheduled "${p}" && grep -q '❯ 1\. Exit and stop tasks' <<<"${p}"; then
          keys Enter
          log "exit dialog listed only scheduled tasks; confirmed exit"
          break
        fi
        keys Escape
        log "exit dialog listed work in flight ($(stopping "${p}" | tr '\n' ';')); stayed, retrying in ${RETRY_S}s"
        sleep "${RETRY_S}"
        try=$(( try + 1 ))
        ;;
    esac
  done
  (( try <= MAX_TRIES )) || { log "work still in flight after ${MAX_TRIES} attempts; giving up"; exit 1; }
  await_channel_notice
}

main "$@"
