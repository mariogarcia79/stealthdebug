#!/bin/bash
# backup-mongo.sh: encrypted MongoDB backup, one copy only.
#
# Run as the deploy user on the VPS. It runs:
#   - weekly, from the mongo-backup.timer user unit (installed by deploy.sh)
#   - at the start of every deploy, before any container changes
#   - by hand when needed: ./scripts/backup-mongo.sh
#
# What it does: mongodump of every database (gzip archive) from the running
# "mongo" container, streamed straight into gpg and encrypted to the site's
# OpenPGP public key. Nothing unencrypted ever touches the disk, and the
# server can't decrypt the backup: only the holder of the private key can.
# The new file replaces the previous backup only once it is complete, so
# there is always exactly one good backup:
#   ~/backups/mongo/mongo-latest.archive.gz.gpg
#
# Restore: see RUNBOOK.md, "MongoDB backup and restore".
#
# Environment overrides:
#   MONGO_BACKUP_DIR          where the backup goes (default ~/backups/mongo)
#   MONGO_BACKUP_KEY          public key file (default: the site's key in the repo)
#   MONGO_BACKUP_FINGERPRINT  fingerprint the key must have
#   MONGO_CONTAINER           container name (default mongo)
set -euo pipefail
umask 077

REPO_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
BACKUP_DIR="${MONGO_BACKUP_DIR:-$HOME/backups/mongo}"
KEY_FILE="${MONGO_BACKUP_KEY:-$REPO_DIR/frontend/public/.well-known/pgp-key.txt}"
# The key in the repo must be this one (contact@stealthdebug.org); if the key
# file is ever replaced by a different key, backups stop instead of being
# silently encrypted to it. Extending the key's expiry keeps the fingerprint.
FINGERPRINT="${MONGO_BACKUP_FINGERPRINT:-0D5B0E0A0B6DBBB2E4CE0C3C6B2C97DB7554E2DD}"
CONTAINER="${MONGO_CONTAINER:-mongo}"
NAME="mongo-latest.archive.gz.gpg"
FINAL="$BACKUP_DIR/$NAME"
PARTIAL="$BACKUP_DIR/.$NAME.partial"

log() { echo "[backup-mongo] $*"; }
die() { echo "[backup-mongo] ERROR: $*" >&2; exit 1; }

command -v gpg >/dev/null || die "gpg is not installed (sudo apt install gnupg)."
[ -r "$KEY_FILE" ] || die "public key not found: $KEY_FILE"
[ "$(podman container inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ] \
  || die "container '$CONTAINER' is not running."

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# One backup at a time (a manual run and the timer, or a deploy).
exec 9>"$BACKUP_DIR/.lock"
flock -w 600 9 || die "another backup is still running."

# Throwaway keyring with only the public key: no state left in ~/.gnupg.
GNUPGHOME=$(mktemp -d)
export GNUPGHOME
cleanup() { rm -rf "$GNUPGHOME"; rm -f "$PARTIAL"; }
trap cleanup EXIT

gpg --batch --quiet --import "$KEY_FILE" 2>/dev/null || die "could not read the public key in $KEY_FILE"
gpg --batch --with-colons --list-keys "$FINGERPRINT" 2>/dev/null | grep -q "^fpr:::::::::$FINGERPRINT:" \
  || die "$KEY_FILE is not the key $FINGERPRINT."

log "dumping '$CONTAINER' and encrypting to $FINGERPRINT..."
START=$(date +%s)
# The credentials are expanded inside the container, from its own environment
# (mongo.env); they never appear in this script, its logs or the host's
# command lines. pipefail: a failing mongodump fails the backup.
podman exec "$CONTAINER" sh -c 'exec mongodump --quiet --archive --gzip \
    --username="$MONGO_INITDB_ROOT_USERNAME" --password="$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase=admin' \
  | gpg --batch --yes --quiet --trust-model always --compress-algo none \
        --recipient "$FINGERPRINT" --output "$PARTIAL" --encrypt

# An empty dump still produces a few hundred bytes; anything less is broken.
SIZE=$(stat -c %s "$PARTIAL")
[ "$SIZE" -gt 200 ] || die "backup is only $SIZE bytes; keeping the previous one."

# Replace the previous backup in one step (same directory = atomic rename).
mv -f "$PARTIAL" "$FINAL"
log "done in $(( $(date +%s) - START ))s: $FINAL ($(numfmt --to=iec "$SIZE"), sha256 $(sha256sum "$FINAL" | cut -c1-16)…)"
