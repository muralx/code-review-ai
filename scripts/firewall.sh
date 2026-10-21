#!/usr/bin/env bash
# Egress allowlist for the reviewer container (root, needs NET_ADMIN). Default DROP on OUTPUT.
set -euo pipefail

DOMAINS=(
  api.anthropic.com claude.ai downloads.claude.ai platform.claude.com statsig.anthropic.com sentry.io
  github.com api.github.com codeload.github.com objects.githubusercontent.com raw.githubusercontent.com
  registry.npmjs.org pypi.org files.pythonhosted.org
  proxy.golang.org sum.golang.org storage.googleapis.com go.dev dl.google.com
  repo.maven.apache.org plugins.gradle.org services.gradle.org
  cli.github.com deb.nodesource.com
)
EXTRA_FILE="/deployment/firewall-allow.txt"
HOST_PORTS="${CRA_HOST_PORTS:-8790}"
ALLOW_HOSTS="${CRA_ALLOW_HOSTS:-}"   # hosts of the deployment's MCP servers, comma-separated

iptables -F OUTPUT
iptables -P OUTPUT ACCEPT   # until the rules are in place
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# The host gateway: the agent-link hub and any MCP server on the host.
gateway="$(getent hosts host.docker.internal | awk '{print $1}' | head -1 || true)"
if [[ -n "${gateway}" ]]; then
  IFS=',' read -ra ports <<<"${HOST_PORTS}"
  for p in "${ports[@]}"; do iptables -A OUTPUT -d "${gateway}" -p tcp --dport "${p}" -j ACCEPT; done
fi

allow_domain() {
  local d="$1" ip
  while read -r ip; do
    [[ -n "${ip}" ]] && iptables -A OUTPUT -d "${ip}" -j ACCEPT
  done < <(getent ahostsv4 "${d}" 2>/dev/null | awk '{print $1}' | sort -u)
}
for d in "${DOMAINS[@]}"; do allow_domain "${d}"; done
IFS=',' read -ra mcp_hosts <<<"${ALLOW_HOSTS}"
for d in "${mcp_hosts[@]}"; do [[ -n "${d}" ]] && allow_domain "${d}"; done
if [[ -f "${EXTRA_FILE}" ]]; then
  while read -r d; do
    d="${d%%#*}"; d="${d// /}"
    [[ -n "${d}" ]] && allow_domain "${d}"
  done < "${EXTRA_FILE}"
fi

# GitHub publishes its ranges; add them so git over HTTPS and the API work regardless of DNS rotation.
if meta="$(curl -fsS --max-time 10 https://api.github.com/meta 2>/dev/null)"; then
  while read -r cidr; do
    [[ "${cidr}" == *:* ]] && continue   # v4 only
    iptables -A OUTPUT -d "${cidr}" -j ACCEPT
  done < <(printf '%s' "${meta}" | jq -r '(.web + .api + .git + .packages // []) | .[]' | sort -u)
fi

iptables -A OUTPUT -j LOG --log-prefix "cra-egress-drop " --log-level 4 -m limit --limit 5/min
iptables -P OUTPUT DROP
echo "[firewall] egress allowlist installed: $(iptables -S OUTPUT | grep -c ACCEPT) accept rules, gateway ${gateway:-none} ports ${HOST_PORTS}" >&2
