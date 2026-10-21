#!/usr/bin/env bash
# scripts/prep-target.sh — materialise the thing to review into a run directory.
#
#   prep-target pr       --run-dir DIR --clones-dir DIR --repo owner/name --number N [--head-sha SHA]
#   prep-target audit    --run-dir DIR --clones-dir DIR --repo owner/name --ref REF [--path P]...
#   prep-target local    --run-dir DIR --path /host/path [--base REF] [--path-scope P]...
#   prep-target siblings --run-dir DIR --clones-dir DIR --plan plan.json
#
# Every subcommand creates RUN/target/ and RUN/meta/ and writes RUN/meta/target.json.
# `siblings` prints a JSON array of clone paths. Nothing else is printed on success.
# Exit: 0 ok · 1 failure · 2 usage. Reference: docs/runs-and-tools.md.

set -euo pipefail
IFS=$'\n\t'

HERE="$( cd "$( dirname "$( readlink -f "${BASH_SOURCE[0]}" )" )" && pwd )"
# shellcheck source=scripts/lib/common.sh
source "${HERE}/lib/common.sh"
LOG_PREFIX="prep-target"

usage() { die 2 "$1
usage: prep-target pr       --run-dir DIR --clones-dir DIR --repo owner/name --number N [--head-sha SHA]
       prep-target audit    --run-dir DIR --clones-dir DIR --repo owner/name --ref REF [--path P]...
       prep-target local    --run-dir DIR --path /host/path [--base REF] [--path-scope P]...
       prep-target siblings --run-dir DIR --clones-dir DIR --plan plan.json"; }

RUN_DIR="" CLONES_DIR="" REPO="" NUMBER="" HEAD_SHA="" REF="" SRC_PATH="" BASE="" PLAN=""
declare -a PATHS=()

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --run-dir)    RUN_DIR="$2"; shift 2 ;;
      --clones-dir) CLONES_DIR="$2"; shift 2 ;;
      --repo)       REPO="$2"; shift 2 ;;
      --number)     NUMBER="$2"; shift 2 ;;
      --head-sha)   HEAD_SHA="$2"; shift 2 ;;
      --ref)        REF="$2"; shift 2 ;;
      --path)       if [[ "${SUB}" == "local" ]]; then SRC_PATH="$2"; else PATHS+=("$2"); fi; shift 2 ;;
      --path-scope) PATHS+=("$2"); shift 2 ;;
      --base)       BASE="$2"; shift 2 ;;
      --plan)       PLAN="$2"; shift 2 ;;
      *) usage "unknown argument: $1" ;;
    esac
  done
}

# ---------- shared ----------

clone_path_for() { printf '%s/%s\n' "${CLONES_DIR}" "${1//\//-}"; }

# ensure_clone owner/name → prints the clone path. Clones with gh when absent, fetches otherwise.
ensure_clone() {
  local repo="$1" path
  path="$(clone_path_for "${repo}")"
  if [[ -d "${path}/.git" ]]; then
    log_info "fetching ${repo}"
    (
      flock 9
      git -C "${path}" fetch --quiet origin 1>&2
      git -C "${path}" remote set-head origin --auto >/dev/null 2>&1 || true
    ) 9>"${path}/.git/cra.lock"
  else
    [[ -e "${path}" ]] && die 1 "${path} exists but is not a git repository"
    log_info "cloning ${repo} into ${path}"
    mkdir -p "$(dirname "${path}")"
    gh repo clone "${repo}" "${path}" -- --quiet 1>&2
    git -C "${path}" remote set-head origin --auto >/dev/null 2>&1 || true
  fi
  printf '%s\n' "${path}"
}

# worktree_at CLONE SHA → RUN/target at that commit, replacing a stale one.
worktree_at() {
  local clone="$1" sha="$2" target="${RUN_DIR}/target"
  (
    flock 9
    if [[ -e "${target}" ]]; then
      log_warn "replacing stale ${target}"
      git -C "${clone}" worktree remove --force "${target}" 2>/dev/null || rm -rf "${target}"
    fi
    git -C "${clone}" worktree prune 2>/dev/null || true   # also drops entries whose dir was deleted
    git -C "${clone}" worktree add --quiet --detach "${target}" "${sha}" 1>&2
  ) 9>"${clone}/.git/cra.lock"
}

# extract_code_review TREEISH CLONE → RUN/meta/target-guidelines (empty dir when absent)
extract_code_review() {
  local treeish="$1" clone="$2" out="${RUN_DIR}/meta/target-guidelines"
  mkdir -p "${out}"
  if git -C "${clone}" cat-file -e "${treeish}:.code-review" 2>/dev/null; then
    git -C "${clone}" archive "${treeish}" .code-review | tar -x -C "${out}" --strip-components=1
  fi
}

copy_code_review_from_tree() {
  local tree="$1" out="${RUN_DIR}/meta/target-guidelines"
  mkdir -p "${out}"
  [[ -d "${tree}/.code-review" ]] && cp -r "${tree}/.code-review/." "${out}/"
  return 0
}

prepare_dirs() {
  [[ -n "${RUN_DIR}" ]] || usage "--run-dir is required"
  mkdir -p "${RUN_DIR}/meta"
  RUN_DIR="$(cd "${RUN_DIR}" && pwd)"   # git -C rebases relative paths; keep everything absolute
}

# ---------- pr ----------

cmd_pr() {
  prepare_dirs
  [[ -n "${CLONES_DIR}" ]] || usage "--clones-dir is required"
  [[ "${REPO}" == */* ]] || usage "--repo must be owner/name"
  [[ "${NUMBER}" =~ ^[0-9]+$ ]] || usage "--number must be numeric"
  need_cmd git gh jq tar

  local clone; clone="$(ensure_clone "${REPO}")"
  local head="${HEAD_SHA}" base
  [[ -n "${head}" ]] || head="$(gh pr view "${NUMBER}" --repo "${REPO}" --json headRefOid -q .headRefOid)"
  base="$(gh pr view "${NUMBER}" --repo "${REPO}" --json baseRefName -q .baseRefName)"
  [[ -n "${head}" && -n "${base}" ]] || die 1 "could not resolve head sha or base branch for ${REPO}#${NUMBER}"

  (
    flock 9
    git -C "${clone}" fetch --quiet origin "pull/${NUMBER}/head" "${base}" 1>&2
  ) 9>"${clone}/.git/cra.lock"
  git -C "${clone}" cat-file -e "${head}^{commit}" 2>/dev/null || die 1 "head ${head} not found after fetch"
  local merge_base; merge_base="$(git -C "${clone}" merge-base "origin/${base}" "${head}")"

  worktree_at "${clone}" "${head}"
  git -C "${clone}" diff --binary "${merge_base}" "${head}" > "${RUN_DIR}/meta/diff.patch"
  git -C "${clone}" diff --name-only -z "${merge_base}" "${head}" | json_array_from_nul > "${RUN_DIR}/meta/files.json"
  gh pr view "${NUMBER}" --repo "${REPO}" \
    --json title,body,url,baseRefName,headRefName,author,state,isDraft,comments,reviews,reviewRequests,commits \
    > "${RUN_DIR}/meta/pr.json"
  # Line comments on the diff: `gh pr view` returns review summaries only, not these. Pages come
  # back as one JSON array each; a failure fails the preparation rather than hiding the thread.
  gh api --paginate "repos/${REPO}/pulls/${NUMBER}/comments?per_page=100" \
    | jq -s 'add // [] | map({id, in_reply_to_id, author: .user.login, path, line, original_line, side,
                              commit_id, created_at, updated_at, body, url: .html_url})' \
    > "${RUN_DIR}/meta/review-comments.json" \
    || die 1 "could not read the line comments of ${REPO}#${NUMBER}"
  extract_code_review "${merge_base}" "${clone}"

  jq -n --arg repo "${REPO}" --argjson number "${NUMBER}" --arg head "${head}" --arg base "${base}" --arg mb "${merge_base}" \
    '{kind:"pr", repo:$repo, number:$number, head_sha:$head, base_ref:$base, merge_base:$mb, identity:$head}' \
    > "${RUN_DIR}/meta/target.json"
  log_info "prepared ${REPO}#${NUMBER} at ${head} (merge-base ${merge_base})"
}

# ---------- audit ----------

cmd_audit() {
  prepare_dirs
  [[ -n "${CLONES_DIR}" ]] || usage "--clones-dir is required"
  [[ "${REPO}" == */* ]] || usage "--repo must be owner/name"
  [[ -n "${REF}" ]] || usage "--ref is required"
  need_cmd git gh jq

  local clone; clone="$(ensure_clone "${REPO}")"
  local sha
  sha="$(git -C "${clone}" rev-parse --verify --quiet "origin/${REF}^{commit}" || git -C "${clone}" rev-parse --verify --quiet "${REF}^{commit}" || true)"
  [[ -n "${sha}" ]] || die 1 "ref ${REF} not found in ${REPO}"

  worktree_at "${clone}" "${sha}"
  local target="${RUN_DIR}/target"
  if (( ${#PATHS[@]} > 0 )); then
    git -C "${target}" ls-files -z -- "${PATHS[@]}" | json_array_from_nul > "${RUN_DIR}/meta/files.json"
  else
    git -C "${target}" ls-files -z | json_array_from_nul > "${RUN_DIR}/meta/files.json"
  fi
  copy_code_review_from_tree "${target}"

  local paths_json paths_hash
  paths_json="$(json_array_from_args "${PATHS[@]+"${PATHS[@]}"}")"
  paths_hash="$(printf '%s' "${paths_json}" | sha256_of_stdin)"
  jq -n --arg repo "${REPO}" --arg ref "${REF}" --arg sha "${sha}" --argjson paths "${paths_json}" --arg id "${sha}:${paths_hash:0:16}" \
    '{kind:"audit", repo:$repo, ref:$ref, sha:$sha, paths:$paths, identity:$id}' > "${RUN_DIR}/meta/target.json"
  log_info "prepared audit of ${REPO} at ${REF} (${sha})"
}

# ---------- local ----------

cmd_local() {
  prepare_dirs
  [[ -n "${SRC_PATH}" ]] || usage "--path is required"
  need_cmd git jq tar
  local src="${SRC_PATH}"
  local top
  top="$(GIT_OPTIONAL_LOCKS=0 git -C "${src}" rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "${top}" ]] || usage "--path ${src} is not inside a git working tree"
  src="${top}"

  local target="${RUN_DIR}/target"
  rm -rf "${target}"
  git clone --quiet --no-hardlinks "${src}" "${target}" 1>&2

  # Working-tree changes to tracked files (staged and unstaged), applied on top of HEAD.
  local patch="${RUN_DIR}/meta/worktree.patch"
  GIT_OPTIONAL_LOCKS=0 git -C "${src}" diff --binary HEAD > "${patch}"
  if [[ -s "${patch}" ]]; then
    git -C "${target}" apply --whitespace=nowarn "${patch}" 1>&2
  fi

  # Untracked, non-ignored files, copied with content and hashed by content.
  local untracked_list="${RUN_DIR}/meta/untracked.nul" untracked_n=0 untracked_sha
  GIT_OPTIONAL_LOCKS=0 git -C "${src}" ls-files --others --exclude-standard -z > "${untracked_list}"
  if [[ -s "${untracked_list}" ]]; then
    tar --null -C "${src}" -T "${untracked_list}" -cf - | tar -C "${target}" -xf -
    untracked_n="$(tr -cd '\0' < "${untracked_list}" | wc -c)"
    untracked_sha="$(sort -z "${untracked_list}" | (cd "${src}" && xargs -0 sha256sum) | sha256_of_stdin)"
  else
    untracked_sha="$(printf '' | sha256_of_stdin)"
  fi
  rm -f "${untracked_list}"
  # Intent-to-add so untracked files show up in the diff as new files; nothing is committed.
  git -C "${target}" add -N --all 1>&2

  local base_ref
  if [[ -n "${BASE}" ]]; then
    base_ref="$(git -C "${target}" rev-parse --verify --quiet "origin/${BASE}^{commit}" >/dev/null && echo "origin/${BASE}" || echo "${BASE}")"
  else
    # The source's own idea of its default branch (its origin/HEAD, read-only), which exists in the
    # snapshot as origin/<name> because a local clone carries the source's local branches. Then
    # main/master. Note origin/HEAD *of the snapshot* is the source's checked-out branch, not its
    # default, so it is only the last resort.
    base_ref=""
    local src_default cand
    src_default="$(GIT_OPTIONAL_LOCKS=0 git -C "${src}" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
    src_default="${src_default#origin/}"
    for cand in ${src_default:+"origin/${src_default}"} origin/main origin/master; do
      if git -C "${target}" rev-parse --verify --quiet "${cand}^{commit}" >/dev/null; then base_ref="${cand}"; break; fi
    done
    [[ -n "${base_ref}" ]] || base_ref="$(git -C "${target}" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo HEAD)"
  fi
  git -C "${target}" rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null || die 1 "base ${base_ref} not found in ${src}"
  local merge_base; merge_base="$(git -C "${target}" merge-base "${base_ref}" HEAD)"

  if (( ${#PATHS[@]} > 0 )); then
    git -C "${target}" diff --binary "${merge_base}" -- "${PATHS[@]}" > "${RUN_DIR}/meta/diff.patch"
    git -C "${target}" diff --name-only -z "${merge_base}" -- "${PATHS[@]}" | json_array_from_nul > "${RUN_DIR}/meta/files.json"
  else
    git -C "${target}" diff --binary "${merge_base}" > "${RUN_DIR}/meta/diff.patch"
    git -C "${target}" diff --name-only -z "${merge_base}" | json_array_from_nul > "${RUN_DIR}/meta/files.json"
  fi
  copy_code_review_from_tree "${target}"

  local head patch_sha identity paths_json
  head="$(GIT_OPTIONAL_LOCKS=0 git -C "${src}" rev-parse HEAD)"
  patch_sha="$(sha256_of_stdin < "${patch}")"
  identity="${head}:${patch_sha:0:16}:${untracked_sha:0:16}"
  paths_json="$(json_array_from_args "${PATHS[@]+"${PATHS[@]}"}")"
  jq -n --arg path "${src}" --arg base "${base_ref}" --arg mb "${merge_base}" --arg head "${head}" --arg psha "${patch_sha}" \
        --argjson n "${untracked_n}" --arg id "${identity}" --argjson paths "${paths_json}" \
    '{kind:"local", path:$path, base_ref:$base, merge_base:$mb, head_sha:$head, paths:$paths, snapshot:{head:$head, patch_sha256:$psha, untracked:$n}, identity:$id}' \
    > "${RUN_DIR}/meta/target.json"
  log_info "snapshotted ${src} (HEAD ${head:0:12}, ${untracked_n} untracked) against ${base_ref}"
}

# ---------- siblings ----------

cmd_siblings() {
  prepare_dirs
  [[ -n "${CLONES_DIR}" ]] || usage "--clones-dir is required"
  [[ -f "${PLAN}" ]] || usage "--plan must name an existing plan.json"
  need_cmd git gh jq
  local -a out=()
  local repo
  while IFS= read -r repo; do
    [[ -n "${repo}" ]] || continue
    out+=("$(ensure_clone "${repo}")")
  done < <(jq -r '.siblings[]? // empty' "${PLAN}")
  json_array_from_args "${out[@]+"${out[@]}"}"
}

main() {
  SUB="${1:-}"; shift || true
  case "${SUB}" in
    pr|audit|local|siblings) ;;
    "") usage "subcommand required" ;;
    *) usage "unknown subcommand: ${SUB}" ;;
  esac
  parse_args "$@"
  "cmd_${SUB}"
}

main "$@"
