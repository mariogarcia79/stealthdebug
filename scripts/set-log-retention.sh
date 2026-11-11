#!/bin/bash
# Keep server logs (which contain visitor IP addresses) for 30 days, as stated
# in the privacy policy (https://stealthdebug.org/privacy).
#
# Run once on the VPS as the admin user (needs sudo):
#   ./scripts/set-log-retention.sh
#
# The containers' output, including nginx's access log, goes to the systemd
# journal (Podman's journald log driver). This sets the journal to delete
# entries older than 30 days, for the system and the users' journals.
set -euo pipefail

DAYS="${1:-30}"
CONF=/etc/systemd/journald.conf.d/50-retention.conf

echo "Setting journal retention to ${DAYS} days in ${CONF}"
sudo mkdir -p "$(dirname "$CONF")"
printf '[Journal]\n# Privacy policy: server logs are deleted after %s days\nMaxRetentionSec=%sday\n' "$DAYS" "$DAYS" \
  | sudo tee "$CONF" >/dev/null
sudo systemctl restart systemd-journald
# Apply it now to entries that are already older
sudo journalctl --vacuum-time="${DAYS}d" >/dev/null

echo "Done. Journal now uses: $(sudo journalctl --disk-usage)"

# Containers must log to the journal for this to cover them
if id deploy >/dev/null 2>&1; then
  DRIVER=$(sudo -iu deploy podman info --format '{{.Host.LogDriver}}' 2>/dev/null || echo unknown)
  echo "Podman log driver for the deploy user: ${DRIVER}"
  if [ "$DRIVER" != "journald" ]; then
    echo "WARNING: containers do not log to the journal (driver: ${DRIVER})."
    echo "         Their logs are kept until each container is recreated (every deploy/restart)."
  fi
fi
