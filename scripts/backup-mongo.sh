#!/bin/bash
# Manual MongoDB backup — run on the VPS as the deploy user.
# Usage:
#   ./scripts/backup-mongo.sh             # backup to ~/mongo-backups/
#   ./scripts/backup-mongo.sh /path/to/   # backup to a custom directory
set -euo pipefail

BACKUP_ROOT="${1:-$HOME/mongo-backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
CONTAINER_PATH="/tmp/mongodump-${TIMESTAMP}"
ARCHIVE="${BACKUP_ROOT}/backup-${TIMESTAMP}.tar.gz"

# Ensure the destination exists
mkdir -p "$BACKUP_ROOT"

echo "[1/4] Creating dump inside the mongo container..."
podman exec mongo mongodump --out="$CONTAINER_PATH"

echo "[2/4] Copying dump to host..."
TEMP_DIR=$(mktemp -d)
podman cp "mongo:${CONTAINER_PATH}" "$TEMP_DIR/"

echo "[3/4] Compressing..."
tar -czf "$ARCHIVE" -C "$TEMP_DIR" .
rm -rf "$TEMP_DIR"

echo "[4/4] Cleaning up container temp files..."
podman exec mongo rm -rf "$CONTAINER_PATH"

SIZE=$(du -sh "$ARCHIVE" | cut -f1)
echo ""
echo "Backup complete: $ARCHIVE ($SIZE)"
echo ""
echo "To verify the archive:"
echo "  tar -tzf $ARCHIVE | head -20"
echo ""
echo "To restore (DESTRUCTIVE — stops backend first):"
echo "  systemctl --user stop backend.service"
echo "  RESTORE_DIR=\$(mktemp -d)"
echo "  tar -xzf $ARCHIVE -C \"\$RESTORE_DIR\""
echo "  podman cp \"\$RESTORE_DIR\" mongo:/tmp/restore"
echo "  podman exec mongo mongorestore /tmp/restore/mongodump-${TIMESTAMP}/stealthdebug --db stealthdebug --drop"
echo "  systemctl --user start backend.service"
echo "  podman exec mongo rm -rf /tmp/restore"
