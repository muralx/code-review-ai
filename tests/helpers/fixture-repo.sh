#!/usr/bin/env bash
# tests/helpers/fixture-repo.sh — git fixtures and a gh shim for the bats suites. Source it.

# make_remote <fixtures dir> <owner> <name>
# Creates <dir>/<owner>-<name>.git, a bare repo with:
#   main: c1 (README, .code-review/manifest.yaml, src/a.go) → c2 (README edit)
#   pr branch from c2: modifies src/a.go, adds src/b.go and .code-review/security.md
#   refs/pull/7/head → pr branch tip; <dir>/<owner>-<name>.pr-7.json canned `gh pr view`
make_remote() {
  local dir="$1" owner="$2" name="$3"
  local bare="${dir}/${owner}-${name}.git" work="${dir}/.work-${owner}-${name}"
  git init -q --bare "${bare}"
  git init -q "${work}" && cd "${work}" || return 1
  git config user.email t@example.com && git config user.name t
  git checkout -q -b main
  mkdir -p .code-review src
  printf 'hello\n' > README.md
  printf 'kind: library\n' > .code-review/manifest.yaml
  printf 'package a\n\nfunc A() int { return 1 }\n' > src/a.go
  git add -A && git commit -q -m c1
  printf 'hello world\n' > README.md
  git add -A && git commit -q -m c2
  git checkout -q -b pr
  printf 'package a\n\nfunc A() int { return 2 }\n' > src/a.go
  printf 'package a\n\nfunc B() int { return 3 }\n' > src/b.go
  printf 'injected\n' > .code-review/security.md
  git add -A && git commit -q -m pr1
  local pr_sha main_sha
  pr_sha="$(git rev-parse HEAD)"; main_sha="$(git rev-parse main)"
  git push -q "${bare}" main pr
  git --git-dir="${bare}" update-ref refs/pull/7/head "${pr_sha}"
  git --git-dir="${bare}" symbolic-ref HEAD refs/heads/main
  cd - >/dev/null || return 1
  rm -rf "${work}"
  cat > "${dir}/${owner}-${name}.pr-7.json" <<JSON
{"number":7,"headRefOid":"${pr_sha}","baseRefName":"main","headRefName":"pr","title":"PR seven","url":"https://example.test/${owner}/${name}/pull/7","state":"OPEN","isDraft":false,"author":{"login":"dev"},"body":"","comments":[],"reviews":[],"reviewRequests":[],"commits":[]}
JSON
  cat > "${dir}/${owner}-${name}.pr-7.review-comments.json" <<JSON
[{"id":11,"in_reply_to_id":null,"user":{"login":"bot"},"path":"src/b.go","line":3,"original_line":3,"side":"RIGHT","commit_id":"${pr_sha}","created_at":"2026-10-14T10:00:00Z","updated_at":"2026-10-14T10:00:00Z","body":"Why is B exported?","html_url":"https://example.test/c/11"},
 {"id":12,"in_reply_to_id":11,"user":{"login":"dev"},"path":"src/b.go","line":3,"original_line":3,"side":"RIGHT","commit_id":"${pr_sha}","created_at":"2026-10-14T10:05:00Z","updated_at":"2026-10-14T10:05:00Z","body":"The CLI calls it; see ADR-7.","html_url":"https://example.test/c/12"}]
JSON
  printf '%s %s\n' "${pr_sha}" "${main_sha}"
}

# make_gh_stub <fixtures dir> <bin dir>: installs a `gh` that serves clones, pr view and the PR's
# line comments (gh api --paginate) from fixtures.
make_gh_stub() {
  local bin="$2"
  mkdir -p "${bin}"
  cat > "${bin}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-} ${2:-}" in
  "repo clone")
    repo="$3"; dest="$4"
    git clone --quiet "${GH_FIXTURES}/${repo//\//-}.git" "${dest}"
    ;;
  "pr view")
    num="$3"; repo=""; q=""
    shift 3
    while (( $# > 0 )); do
      case "$1" in
        --repo) repo="$2"; shift 2 ;;
        --json) shift 2 ;;
        -q) q="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    f="${GH_FIXTURES}/${repo//\//-}.pr-${num}.json"
    [[ -f "${f}" ]] || { echo "gh-stub: no fixture ${f}" >&2; exit 1; }
    if [[ -n "${q}" ]]; then jq -r "${q}" "${f}"; else cat "${f}"; fi
    ;;
  "api --paginate")
    [[ -z "${GH_STUB_FAIL_API:-}" ]] || { echo "gh-stub: HTTP 403" >&2; exit 1; }
    # repos/<owner>/<name>/pulls/<n>/comments?...: one page from <owner>-<name>.pr-<n>.review-comments.json, else [].
    path="${3%%\?*}"; IFS=/ read -r _ owner name _ num _ <<<"${path}"
    f="${GH_FIXTURES}/${owner}-${name}.pr-${num}.review-comments.json"
    if [[ -f "${f}" ]]; then cat "${f}"; else echo '[]'; fi
    ;;
  *) echo "gh-stub: unsupported: $*" >&2; exit 1 ;;
esac
SH
  chmod +x "${bin}/gh"
}
