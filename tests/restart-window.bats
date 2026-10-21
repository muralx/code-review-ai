#!/usr/bin/env bats
# restart-window.sh against a fake tmux: the pane plays the coordinator's dialogs and every key
# sent is logged, so each test checks what the helper answered.

setup() {
  ROOT="$( cd "$( dirname "$BATS_TEST_FILENAME" )/.." && pwd )"
  SCRIPT="${ROOT}/scripts/restart-window.sh"
  TMP="$(mktemp -d)"
  mkdir -p "${TMP}/bin" "${TMP}/home"
  export HOME="${TMP}/home" PANE_DIR="${TMP}" CRA_RESTART_POLL_S=0 CRA_RESTART_RETRY_S=0 \
    CRA_RESTART_EXIT_WAIT_S=5 CRA_RESTART_BOOT_WAIT_S=5
  cat > "${TMP}/bin/tmux" <<'EOF'
#!/usr/bin/env bash
# State machine: prompt -(/exit)-> $ON_EXIT; dialog -(Enter)-> notice; dialog -(Escape)-> prompt;
# notice -(Enter)-> booted. The pane shows the file for the current state.
state="$(cat "${PANE_DIR}/state" 2>/dev/null || echo prompt)"
case "$1" in
  has-session) exit 0 ;;
  capture-pane) cat "${PANE_DIR}/pane-${state}" 2>/dev/null; exit 0 ;;
  send-keys)
    shift 3
    echo "$*" >> "${PANE_DIR}/keys"
    case "${state}:$*" in
      "prompt:/exit Enter") echo "${ON_EXIT}" > "${PANE_DIR}/state" ;;
      "dialog:Enter") echo notice > "${PANE_DIR}/state" ;;
      "dialog:Escape") echo prompt > "${PANE_DIR}/state" ;;
      "bye:/exit Enter") ;;
      "notice:Enter") echo booted > "${PANE_DIR}/state" ;;
    esac
    exit 0 ;;
esac
EOF
  chmod +x "${TMP}/bin/tmux"
  export PATH="${TMP}/bin:${PATH}"
  echo '❯ ' > "${TMP}/pane-prompt"
  printf '❯ /exit\n  ⎿  Bye!\n' > "${TMP}/pane-bye"
  printf '  WARNING: Loading development channels\n  ❯ 1. I am using this for local development\n    2. Exit\n' > "${TMP}/pane-notice"
  echo '❯ /boot' > "${TMP}/pane-booted"
}

teardown() { rm -rf "${TMP}"; }

dialog() {
  { echo '  Background work is running'
    echo '  The following will stop when you exit:'
    for item in "$@"; do echo "  ${item}"; done
    echo '  ❯ 1. Exit and stop tasks'
    echo '    2. Move to background and exit'
    echo '    3. Stay'
    echo '  Enter to confirm · Esc to cancel'; } > "${TMP}/pane-dialog"
}

@test "only the poll job would stop: confirms the exit, then the channel notice" {
  dialog 'scheduled task · 3-59/10 * * * * · /poll'
  export ON_EXIT=dialog
  run "${SCRIPT}"
  [ "$status" -eq 0 ]
  [ "$(cat "${TMP}/keys")" = "$(printf '/exit Enter\nEnter\nEnter')" ]
  [ "$(cat "${TMP}/state")" = booted ]
}

@test "a subagent in flight: stays every time and gives up without exiting" {
  dialog 'subagent · bff3 spec-compliance' 'scheduled task · 3-59/10 * * * * · /poll'
  export ON_EXIT=dialog CRA_RESTART_MAX_TRIES=2
  run "${SCRIPT}"
  [ "$status" -eq 1 ]
  [ "$(cat "${TMP}/keys")" = "$(printf '/exit Enter\nEscape\n/exit Enter\nEscape')" ]
  [ "$(cat "${TMP}/state")" = prompt ]
}

@test "no background work: the window exits at once; only the channel notice is answered" {
  export ON_EXIT=bye
  ( sleep 1; echo notice > "${TMP}/state" ) &
  run "${SCRIPT}"
  wait
  [ "$status" -eq 0 ]
  [ "$(cat "${TMP}/keys")" = "$(printf '/exit Enter\nEnter')" ]
}

@test "a second helper while one runs does nothing" {
  mkdir -p "${HOME}/.cra"
  exec 8>"${HOME}/.cra/restart.lock"
  flock -n 8
  run "${SCRIPT}"
  [ "$status" -eq 0 ]
  [ ! -f "${TMP}/keys" ]
}

@test "--notice-only: sends no /exit, only confirms the channel notice" {
  echo notice > "${TMP}/state"
  run "${SCRIPT}" --notice-only
  [ "$status" -eq 0 ]
  [ "$(cat "${TMP}/keys")" = "Enter" ]
  [ "$(cat "${TMP}/state")" = booted ]
}
