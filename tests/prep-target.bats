#!/usr/bin/env bats

setup() {
  ROOT="$( cd "$( dirname "$BATS_TEST_FILENAME" )/.." && pwd )"
  PREP="${ROOT}/scripts/prep-target.sh"
  TMP="$(mktemp -d)"
  FIX="${TMP}/fixtures"; mkdir -p "${FIX}"
  source "${ROOT}/tests/helpers/fixture-repo.sh"
  read -r PR_SHA MAIN_SHA < <(make_remote "${FIX}" acme widgets)
  make_gh_stub "${FIX}" "${TMP}/bin"
  export PATH="${TMP}/bin:${PATH}" GH_FIXTURES="${FIX}"
  RUN="${TMP}/runs/r1"; CLONES="${TMP}/clones"
}

teardown() { chmod -R u+w "${TMP}" 2>/dev/null || true; rm -rf "${TMP}"; }

@test "usage errors exit 2" {
  run "${PREP}"; [ "$status" -eq 2 ]
  run "${PREP}" pr --run-dir "${RUN}"; [ "$status" -eq 2 ]
  run "${PREP}" bogus; [ "$status" -eq 2 ]
}

@test "pr: worktree at head, diff and files, .code-review from the merge-base, identity = head" {
  run "${PREP}" pr --run-dir "${RUN}" --clones-dir "${CLONES}" --repo acme/widgets --number 7
  [ "$status" -eq 0 ]
  [ -f "${RUN}/target/src/b.go" ]
  [ "$(git -C "${RUN}/target" rev-parse HEAD)" = "${PR_SHA}" ]
  grep -q 'func B' "${RUN}/meta/diff.patch"
  [ "$(jq -r 'sort | join(",")' "${RUN}/meta/files.json")" = ".code-review/security.md,src/a.go,src/b.go" ]
  [ -f "${RUN}/meta/target-guidelines/manifest.yaml" ]
  [ "$(jq -r '[.[] | "\(.author):\(.in_reply_to_id // "-"):\(.path):\(.line)"] | join(",")' "${RUN}/meta/review-comments.json")" = "bot:-:src/b.go:3,dev:11:src/b.go:3" ]
  [ "$(jq -r '.[1].body' "${RUN}/meta/review-comments.json")" = "The CLI calls it; see ADR-7." ]
  [ ! -e "${RUN}/meta/target-guidelines/security.md" ]
  [ "$(jq -r .identity "${RUN}/meta/target.json")" = "${PR_SHA}" ]
  [ "$(jq -r .merge_base "${RUN}/meta/target.json")" = "${MAIN_SHA}" ]
  [ "$(jq -r .title "${RUN}/meta/pr.json")" = "PR seven" ]
}

@test "pr: a stale target directory is replaced and the explicit head sha is honoured" {
  mkdir -p "${RUN}/target" && echo junk > "${RUN}/target/junk"
  run "${PREP}" pr --run-dir "${RUN}" --clones-dir "${CLONES}" --repo acme/widgets --number 7 --head-sha "${PR_SHA}"
  [ "$status" -eq 0 ]
  [ ! -e "${RUN}/target/junk" ]
  [ "$(git -C "${RUN}/target" rev-parse HEAD)" = "${PR_SHA}" ]
  # second run on the same clone reuses it (fetch path) and still succeeds
  run "${PREP}" pr --run-dir "${TMP}/runs/r2" --clones-dir "${CLONES}" --repo acme/widgets --number 7
  [ "$status" -eq 0 ]
}

@test "audit: checkout at ref, files scoped by path, no diff, guidelines from the tree" {
  run "${PREP}" audit --run-dir "${RUN}" --clones-dir "${CLONES}" --repo acme/widgets --ref main --path src
  [ "$status" -eq 0 ]
  [ "$(git -C "${RUN}/target" rev-parse HEAD)" = "${MAIN_SHA}" ]
  [ "$(jq -r 'join(",")' "${RUN}/meta/files.json")" = "src/a.go" ]
  [ ! -e "${RUN}/meta/diff.patch" ]
  [ -f "${RUN}/meta/target-guidelines/manifest.yaml" ]
  [ "$(jq -r .kind "${RUN}/meta/target.json")" = "audit" ]
  [[ "$(jq -r .identity "${RUN}/meta/target.json")" == "${MAIN_SHA}:"* ]]
}

@test "local: snapshot includes committed, uncommitted and untracked changes; source untouched; identity stable" {
  SRC="${TMP}/dev/widgets"
  git clone -q "${FIX}/acme-widgets.git" "${SRC}"
  git -C "${SRC}" config user.email t@example.com; git -C "${SRC}" config user.name t
  git -C "${SRC}" checkout -q -b feat main
  printf 'package a\n\nfunc C() int { return 4 }\n' > "${SRC}/src/c.go"
  git -C "${SRC}" add -A && git -C "${SRC}" commit -q -m "add c"
  printf 'hello world!!\n' > "${SRC}/README.md"          # uncommitted tracked change
  printf 'scratch\n' > "${SRC}/notes.txt"                # untracked
  before="$(git -C "${SRC}" status --porcelain)"
  chmod -R a-w "${SRC}"
  run "${PREP}" local --run-dir "${RUN}" --path "${SRC}/src"
  [ "$status" -eq 0 ]
  chmod -R u+w "${SRC}"
  [ "$(git -C "${SRC}" status --porcelain)" = "${before}" ]
  grep -q 'func C' "${RUN}/meta/diff.patch"
  grep -q 'hello world!!' "${RUN}/meta/diff.patch"
  grep -q 'scratch' "${RUN}/meta/diff.patch"
  [ "$(jq -r 'sort | join(",")' "${RUN}/meta/files.json")" = "README.md,notes.txt,src/c.go" ]
  [ -f "${RUN}/target/notes.txt" ]
  [ "$(jq -r .snapshot.untracked "${RUN}/meta/target.json")" = "1" ]
  [ "$(jq -r .base_ref "${RUN}/meta/target.json")" = "origin/main" ]
  [ "$(jq -r .merge_base "${RUN}/meta/target.json")" = "${MAIN_SHA}" ]
  id1="$(jq -r .identity "${RUN}/meta/target.json")"
  run "${PREP}" local --run-dir "${TMP}/runs/r2" --path "${SRC}"
  [ "$status" -eq 0 ]
  [ "$(jq -r .identity "${TMP}/runs/r2/meta/target.json")" = "${id1}" ]
  printf 'scratch more\n' > "${SRC}/notes.txt"
  run "${PREP}" local --run-dir "${TMP}/runs/r3" --path "${SRC}"
  [ "$status" -eq 0 ]
  [ "$(jq -r .identity "${TMP}/runs/r3/meta/target.json")" != "${id1}" ]
  [ -f "${RUN}/meta/target-guidelines/manifest.yaml" ]
}

@test "local: explicit base and path scope" {
  SRC="${TMP}/dev/widgets"
  git clone -q "${FIX}/acme-widgets.git" "${SRC}"
  git -C "${SRC}" checkout -q pr
  run "${PREP}" local --run-dir "${RUN}" --path "${SRC}" --base main --path-scope src
  [ "$status" -eq 0 ]
  [ "$(jq -r 'sort | join(",")' "${RUN}/meta/files.json")" = "src/a.go,src/b.go" ]
}

@test "local: refuses a path outside a git work tree" {
  mkdir -p "${TMP}/plain"
  run "${PREP}" local --run-dir "${RUN}" --path "${TMP}/plain"
  [ "$status" -eq 2 ]
}

@test "siblings: clones every repo in plan.json and prints their paths" {
  make_remote "${FIX}" acme widgets-sdk >/dev/null
  mkdir -p "${RUN}"
  echo '{"siblings":["acme/widgets-sdk"]}' > "${RUN}/plan.json"
  run --separate-stderr "${PREP}" siblings --run-dir "${RUN}" --clones-dir "${CLONES}" --plan "${RUN}/plan.json"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq -r '.[0]')" = "${CLONES}/acme-widgets-sdk" ]
  [ -d "${CLONES}/acme-widgets-sdk/.git" ]
  echo '{"siblings":[]}' > "${RUN}/plan.json"
  run --separate-stderr "${PREP}" siblings --run-dir "${RUN}" --clones-dir "${CLONES}" --plan "${RUN}/plan.json"
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
}

@test "pr: line comments that cannot be read fail the preparation" {
  GH_STUB_FAIL_API=1 run "${PREP}" pr --run-dir "${RUN}" --clones-dir "${CLONES}" --repo acme/widgets --number 7
  [ "$status" -ne 0 ]
  [[ "$output" == *"could not read the line comments of acme/widgets#7"* ]]
}
