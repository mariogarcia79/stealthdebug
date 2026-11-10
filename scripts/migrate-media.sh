#!/bin/bash
# Media migration — run on the VPS as the deploy user, with the site running.
#
#   ./scripts/migrate-media.sh               # backup to ~/uploads-backups/
#   ./scripts/migrate-media.sh /path/to/dir  # backup somewhere else
#
# What it does:
#   1. Exports the uploads volume to a tar file (backup).
#   2. Gives the volume to the user the backend runs as (node, uid 1000 in the
#      container). Images written by the old, root-run backend are read-only
#      for it, so uploads and resized copies fail with EACCES.
#   3. Restarts the backend, whose startup sync registers every existing image
#      in the media library and creates its 480/960/1600px copies.
#   4. Reports the result.
#
# Safe to run more than once. Original image files are never modified or
# deleted (only their owner changes); posts, comments and users are not
# touched. Restore the backup with:
#   podman volume import <volume> <backup.tar>   (then run this script again)
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "Run as the deploy user, not root."
  exit 1
fi

BACKUP_ROOT="${1:-$HOME/uploads-backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Quadlet names the volume systemd-backend-uploads (older Podman: backend-uploads)
VOLUME=$(podman volume ls --format '{{.Name}}' | grep -xE '(systemd-)?backend-uploads' | head -1 || true)
if [ -z "$VOLUME" ]; then
  echo "ERROR: uploads volume not found (podman volume ls)."
  exit 1
fi
MOUNTPOINT=$(podman volume inspect --format '{{.Mountpoint}}' "$VOLUME")
echo "Volume: $VOLUME ($MOUNTPOINT)"

if ! podman container exists backend; then
  echo "ERROR: backend container is not running. Deploy first."
  exit 1
fi

# --- 1. Backup -----------------------------------------------------------------
mkdir -p "$BACKUP_ROOT"
ARCHIVE="$BACKUP_ROOT/uploads-$TIMESTAMP.tar"
echo "[1/4] Backing up the volume to $ARCHIVE ..."
podman volume export --output "$ARCHIVE" "$VOLUME"
echo "      $(du -h "$ARCHIVE" | cut -f1), $(tar -tf "$ARCHIVE" | grep -cE '\.(webp|png|jpe?g|gif)$') image files"

# --- 2. Ownership --------------------------------------------------------------
APP_UID=$(podman exec backend id -u)
APP_GID=$(podman exec backend id -g)
BEFORE=$(podman unshare stat -c '%u:%g' "$MOUNTPOINT")
echo "[2/4] Owner of the volume (as seen in containers): $BEFORE -> $APP_UID:$APP_GID"
# podman unshare runs in the same user namespace as the containers, so these
# ids mean the same as inside the backend container.
podman unshare chown -R "$APP_UID:$APP_GID" "$MOUNTPOINT"
# nginx (another user) only needs to read: files 644, directories 755
podman unshare find "$MOUNTPOINT" -type d -exec chmod 755 {} +
podman unshare find "$MOUNTPOINT" -type f -exec chmod 644 {} +

# --- 3. Restart: startup sync creates library records and resized copies -------
SINCE=$(date --iso-8601=seconds)
echo "[3/4] Restarting the backend ..."
systemctl --user restart backend.service

RESULT=""
for _ in $(seq 1 60); do
  RESULT=$(podman logs --since "$SINCE" backend 2>&1 | grep -E '^Media(: | sync)' || true)
  if echo "$RESULT" | grep -qE 'Media sync: [0-9]+ files|Media: |Media sync failed'; then
    break
  fi
  sleep 2
done

# --- 4. Report -----------------------------------------------------------------
echo "[4/4] Result:"
if [ -z "$RESULT" ]; then
  echo "      No media sync line in the backend log after 2 minutes:"
  podman logs --since "$SINCE" backend 2>&1 | tail -20
  exit 1
fi
echo "$RESULT" | sed 's/^/      /'
VARIANTS=$(podman unshare find "$MOUNTPOINT/variants" -name '*.webp' 2>/dev/null | wc -l)
echo "      Resized copies on disk: $VARIANTS"

if echo "$RESULT" | grep -qE 'Media: |Media sync failed|skipped| [1-9][0-9]* failed'; then
  echo "Migration finished with errors (see above). Backup: $ARCHIVE"
  exit 1
fi
echo "Migration complete. Backup: $ARCHIVE"
