#!/usr/bin/env bash
# On-demand smoke test: image builds, a deployment renders, the container starts without a
# login or a hub, and the deterministic pipeline runs inside it against bash fixtures.
# Usage: tests/smoke/compose-smoke.sh [image-tag]
set -euo pipefail
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
IMAGE="${1:-code-review-ai:smoke}"
TMP="$(mktemp -d)"
trap 'cd "${TMP}/dep" 2>/dev/null && docker compose down -v >/dev/null 2>&1 || true; rm -rf "${TMP}"' EXIT

echo "== build ${IMAGE}"
docker build -q -f "${ROOT}/docker/Dockerfile" -t "${IMAGE}" "${ROOT}" >/dev/null

echo "== fixtures"
mkdir -p "${TMP}/fixtures" "${TMP}/bin"
# shellcheck source=tests/helpers/fixture-repo.sh
source "${ROOT}/tests/helpers/fixture-repo.sh"
make_remote "${TMP}/fixtures" acme widgets >/dev/null
make_remote "${TMP}/fixtures" acme widgets-sdk >/dev/null
make_gh_stub "${TMP}/fixtures" "${TMP}/bin"

echo "== init deployment"
"${ROOT}/bin/cra" init --dir "${TMP}/dep" --company "${ROOT}/tests/fixtures/company-acme" --link \
  --workspace smoke --image "${IMAGE}" --local-root "${TMP}/fixtures" --local-root "${TMP}/bin" >/dev/null
printf 'GH_TOKEN=unused\nCRA_FIREWALL=off\n' > "${TMP}/dep/.env"
# The smoke container must not start the coordinator loop (no login): override the entrypoint.
cat > "${TMP}/dep/compose.override.yaml" <<EOF
services:
  reviewer:
    entrypoint: ["sleep", "infinity"]
    user: "1000"
EOF
cd "${TMP}/dep"
docker compose up -d >/dev/null
sleep 2

echo "== toolchains in the image"
docker compose exec -T reviewer bash -c 'node --version && go version && python3 --version && java -version 2>&1 | head -1 && gh --version | head -1 && claude --version'

echo "== pipeline inside the container"
cat > "${TMP}/dep/request.json" <<EOF
{"action":"review","target":{"kind":"pr","repo":"acme/widgets","number":7},"context":"smoke"}
EOF
docker compose exec -T -e PATH="${TMP}/bin:/home/reviewer/.local/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin" -e GH_FIXTURES="${TMP}/fixtures" reviewer \
  bash -c 'cd /deployment && id=$(cra run new --request request.json --intake poll) && cra run prepare "$id" >/dev/null && ls prompts 2>/dev/null; ls "runs/$id/prompts" && cra status'

echo "== smoke OK"
