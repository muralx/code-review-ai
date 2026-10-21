#!/usr/bin/env bash
# Container entrypoint. Runs as root only long enough to install the egress firewall and fix
# volume ownership, then drops to `reviewer` for the supervisor.
set -euo pipefail
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [[ "${CRA_FIREWALL:-on}" != "off" ]]; then
  "${HERE}/firewall.sh" || { echo "[entrypoint] firewall setup failed; refusing to start without it (set CRA_FIREWALL=off to override)" >&2; exit 1; }
else
  echo "[entrypoint] firewall disabled by CRA_FIREWALL=off" >&2
fi

# A fresh named volume is seeded from the image, but a volume created by an older image may
# carry a different uid. Fix ownership once, cheaply, by checking the root only.
if [[ "$(stat -c %u /home/reviewer)" != "1000" ]]; then
  chown -R reviewer:reviewer /home/reviewer
fi
mkdir -p /deployment/runs /deployment/clones
chown reviewer:reviewer /deployment/runs /deployment/clones 2>/dev/null || true

exec gosu reviewer "${HERE}/supervisor.sh"
