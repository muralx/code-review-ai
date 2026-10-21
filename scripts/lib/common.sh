#!/usr/bin/env bash
# scripts/lib/common.sh — shared helpers for the bash tools. Source, do not run.

log_info() { printf '[%s] %s\n' "${LOG_PREFIX:-cra}" "$*" >&2; }
log_warn() { printf '[%s] warning: %s\n' "${LOG_PREFIX:-cra}" "$*" >&2; }

# die <exit code> <message>
die() {
  local code="$1"; shift
  printf '[%s] error: %s\n' "${LOG_PREFIX:-cra}" "$*" >&2
  exit "${code}"
}

need_cmd() {
  local c
  for c in "$@"; do command -v "${c}" >/dev/null 2>&1 || die 1 "required command not found: ${c}"; done
}

# Read NUL-separated strings on stdin, print a JSON array.
json_array_from_nul() {
  jq -Rs 'split("\u0000") | map(select(length > 0))'
}

# Print a JSON array from the remaining arguments.
json_array_from_args() {
  if (( $# == 0 )); then printf '[]\n'; return; fi
  printf '%s\0' "$@" | json_array_from_nul
}

sha256_of_stdin() { sha256sum | cut -d' ' -f1; }
