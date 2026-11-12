#!/bin/bash
# deploy.sh — deploys the application on the VPS.
#
# CI mode (called by GitHub Actions):
#   BACKEND_IMAGE and FRONTEND_IMAGE env vars must be set to the full
#   ghcr.io image references, and DEPLOY_SHA to the commit those images were
#   built from. The script checks out exactly that commit (so config and
#   images always match), pulls the images, and retags them as the
#   localhost/ names the quadlet files reference. MCP_IMAGE (optional) is
#   the MCP server's image.
#
# The MCP server (agents) is deployed only once ~/.env/mcp.env exists
# (RUNBOOK §13); until then its unit isn't installed.
#
# Local mode (called manually):
#   BACKEND_IMAGE and FRONTEND_IMAGE are unset. The script checks out
#   DEPLOY_SHA if given, otherwise the latest origin/main, and builds the
#   images locally with podman build.
#
# Before changing anything, the database is backed up (encrypted, replacing
# the previous backup: scripts/backup-mongo.sh). If that fails, the deploy
# stops. SKIP_DB_BACKUP=1 skips it (emergencies only).
#
# On any failure the previous config, git commit and images are restored.
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "Please do not run as root"
  exit 1
fi

# --- Single deploy at a time ------------------------------------------------
# CI also serialises deploys (concurrency group in ci.yml); this lock covers
# manual runs overlapping with CI. Re-runs this script under flock, waiting up
# to 10 minutes for a running deploy. -o keeps the lock out of child processes
# (rootless podman leaves a long-lived pause process that would otherwise
# inherit it and hold the lock forever).
if [ -z "${DEPLOY_LOCK_HELD:-}" ]; then
  export DEPLOY_LOCK_HELD=1
  exec flock -o -w 600 -E 75 "$HOME/.deploy.lock" "$0" "$@"
fi

BACKUP_DIR="/home/deploy/.config/containers.backup.$(date +%s)"

# --- Record current state for rollback --------------------------------------
# (DEPLOY_PREV_COMMIT: set when this script re-runs itself after checkout)
PREV_COMMIT=${DEPLOY_PREV_COMMIT:-$(git rev-parse HEAD)}
PREV_BACKEND_ID=$(podman image inspect --format '{{.Id}}' localhost/backend:latest 2>/dev/null || true)
PREV_FRONTEND_ID=$(podman image inspect --format '{{.Id}}' localhost/frontend:latest 2>/dev/null || true)
PREV_MCP_ID=$(podman image inspect --format '{{.Id}}' localhost/mcp:latest 2>/dev/null || true)

if [ -d /home/deploy/.config/containers ]; then
  cp -r /home/deploy/.config/containers "$BACKUP_DIR"
  echo "Backed up existing deployment to $BACKUP_DIR"
fi

rollback() {
  trap - ERR
  echo "ERROR: Deployment failed. Rolling back to previous state..."

  # Restore the source checkout
  git checkout -q --detach "$PREV_COMMIT" || echo "WARNING: could not restore git commit $PREV_COMMIT"

  # Restore the images the previous config was running
  if [ -n "$PREV_BACKEND_ID" ]; then
    podman tag "$PREV_BACKEND_ID" localhost/backend:latest || echo "WARNING: could not restore backend image"
  fi
  if [ -n "$PREV_FRONTEND_ID" ]; then
    podman tag "$PREV_FRONTEND_ID" localhost/frontend:latest || echo "WARNING: could not restore frontend image"
  fi
  if [ -n "$PREV_MCP_ID" ]; then
    podman tag "$PREV_MCP_ID" localhost/mcp:latest || echo "WARNING: could not restore mcp image"
  fi

  # Restore config and restart
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf /home/deploy/.config/containers
    mv "$BACKUP_DIR" /home/deploy/.config/containers
    systemctl --user daemon-reload || true
    systemctl --user restart webpage-pod.service       || true
    systemctl --user restart observability-pod.service || true
    echo "Rollback complete (commit ${PREV_COMMIT:0:7})."
  else
    echo "No config backup to restore."
  fi
  exit 1
}

trap rollback ERR

# --- Check out the exact commit being deployed ------------------------------
git fetch --quiet origin main
TARGET="${DEPLOY_SHA:-origin/main}"
git checkout -q --detach "$TARGET"
echo "Checked out $(git rev-parse --short HEAD) (previous: ${PREV_COMMIT:0:7})."

# git checkout writes deploy.sh as a new file; this process keeps running the
# version it started with (the previous commit's). If the script changed,
# continue with the new version so its changes apply in this deploy, not the
# next one. Nothing has been modified yet; the new run makes its own backup.
if [ -z "${DEPLOY_REEXEC:-}" ] && ! git diff --quiet "$PREV_COMMIT" HEAD -- deploy.sh; then
  echo "deploy.sh changed in this commit: continuing with the new version."
  trap - ERR
  rm -rf "$BACKUP_DIR"
  export DEPLOY_REEXEC=1 DEPLOY_PREV_COMMIT="$PREV_COMMIT"
  exec "$0" "$@"
fi

# --- Back up the database before touching any container ---------------------
if [ -n "${SKIP_DB_BACKUP:-}" ]; then
  echo "WARNING: SKIP_DB_BACKUP set: deploying without a database backup."
elif [ "$(podman container inspect --format '{{.State.Running}}' mongo 2>/dev/null)" = "true" ]; then
  ./scripts/backup-mongo.sh
else
  # First deploy, or mongo is down: there is nothing running to back up.
  echo "WARNING: mongo is not running; no database backup before this deploy."
fi

# Clean previous config (volumes are stored separately and are NOT affected)
rm -rf /home/deploy/.config/containers
echo "Cleaned previous deployment."

# Create directory structure
mkdir -p /home/deploy/.config/containers/certs
mkdir -p /home/deploy/.config/containers/mongo
mkdir -p /home/deploy/.config/containers/nginx
mkdir -p /home/deploy/.config/containers/prometheus
mkdir -p /home/deploy/.config/containers/env
mkdir -p /home/deploy/.config/containers/systemd
# Quadlet reads ~/.config/containers/systemd directly; ~/.config/systemd/user
# is left alone (it may hold other user units and timers).

chmod -R 700 /home/deploy/.config/containers
echo "Created directory structure."

# Copy config files
cp -r /home/deploy/.certs/* /home/deploy/.config/containers/certs/
cp -r ./nginx/*              /home/deploy/.config/containers/nginx/
chmod -R 700 /home/deploy/.config/containers/nginx
chmod -R 700 /home/deploy/.config/containers/certs

# Refresh Cloudflare IP ranges. If Cloudflare is unreachable, keep the list
# from the previous deployment rather than failing or deploying an empty one.
if ! ./nginx/cloudflare-ip-whitelist-sync.sh; then
  if [ -f "$BACKUP_DIR/nginx/cloudflare" ]; then
    cp "$BACKUP_DIR/nginx/cloudflare" /home/deploy/.config/containers/nginx/cloudflare
    echo "WARNING: Cloudflare IP fetch failed; reusing the list from the previous deployment."
  else
    echo "ERROR: Cloudflare IP fetch failed and no previous list exists."
    false
  fi
fi
echo "Copied nginx configuration and certs."

cp -r ./mongo/* /home/deploy/.config/containers/mongo/
chmod -R 700 /home/deploy/.config/containers/mongo
echo "Copied mongo configuration."

# Prometheus config with the Grafana Cloud token lives in ~/.prometheus (not
# in git). Monitoring must not block a site deploy: without it, use the repo
# config minus remote_write (Prometheus then only keeps data locally).
if [ -f /home/deploy/.prometheus/prometheus.yml ]; then
  cp -r /home/deploy/.prometheus/* /home/deploy/.config/containers/prometheus/
  echo "Copied prometheus configuration."
else
  awk '/^remote_write:/ {exit} {print}' ./prometheus/prometheus.yml \
    > /home/deploy/.config/containers/prometheus/prometheus.yml
  echo "WARNING: ~/.prometheus/prometheus.yml not found; using the repo config without remote_write (no Grafana Cloud)."
fi
chmod -R 744 /home/deploy/.config/containers/prometheus

cp -r /home/deploy/.env/* /home/deploy/.config/containers/env/
chmod -R 700 /home/deploy/.config/containers/env/
chmod 600 /home/deploy/.config/containers/env/*
echo "Copied environment variable files."

# Copy quadlet service files, then pull/build images
cp -r ./services/* /home/deploy/.config/containers/systemd/

# MCP server: only with its environment file (keys, URLs)
if [ -f /home/deploy/.env/mcp.env ]; then
  MCP_ENABLED=1
else
  MCP_ENABLED=0
  rm -f /home/deploy/.config/containers/systemd/mcp.container
  echo "No ~/.env/mcp.env: the MCP server is not deployed (RUNBOOK §13)."
fi
# nginx reaches it by container name, like the backend (each container has
# its own address on app.network); without it, the repo's placeholder stays
if [ "$MCP_ENABLED" = 1 ]; then
  printf '# Written by deploy.sh\nupstream mcp {\n    server mcp:4100;\n}\n' \
    > /home/deploy/.config/containers/nginx/mcp-upstream.conf
fi

if [ -n "${BACKEND_IMAGE:-}" ] && [ -n "${FRONTEND_IMAGE:-}" ]; then
  echo "CI mode: pulling pre-built images from registry..."

  # Authenticate to ghcr.io if a token is provided (only needed for private images)
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | podman login ghcr.io \
      --username "$(echo "$BACKEND_IMAGE" | cut -d'/' -f2)" \
      --password-stdin
  fi

  podman pull "$BACKEND_IMAGE"
  podman pull "$FRONTEND_IMAGE"
  if [ "$MCP_ENABLED" = 1 ] && [ -n "${MCP_IMAGE:-}" ]; then
    podman pull "$MCP_IMAGE"
    podman tag "$MCP_IMAGE" localhost/mcp:latest
  fi

  # Retag to the localhost names the quadlet files reference by default,
  # so no quadlet file changes are needed in the repo.
  podman tag "$BACKEND_IMAGE"  localhost/backend:latest
  podman tag "$FRONTEND_IMAGE" localhost/frontend:latest

  echo "Pulled and tagged images as localhost/backend:latest and localhost/frontend:latest."
else
  echo "Local mode: building images with podman build..."
  podman build -t backend:latest  ./backend/
  podman build -t frontend:latest ./frontend/
  if [ "$MCP_ENABLED" = 1 ]; then podman build -t mcp:latest ./mcp/; fi
  echo "Built backend and frontend images."
fi

chmod -R 700 /home/deploy/.config/containers/systemd/
chmod 600 /home/deploy/.config/containers/systemd/*.container
chmod 600 /home/deploy/.config/containers/systemd/*.volume
chmod 600 /home/deploy/.config/containers/systemd/*.network
chmod 600 /home/deploy/.config/containers/systemd/*.pod
# Drop-ins for user units that aren't quadlets (only these files are
# replaced; anything else in ~/.config/systemd/user is left alone).
mkdir -p /home/deploy/.config/systemd/user/podman.service.d
install -m 644 ./systemd/podman.service.d/quiet.conf \
  /home/deploy/.config/systemd/user/podman.service.d/quiet.conf
# Weekly database backup (service points at this checkout's script)
sed "s|@REPO@|$PWD|g" ./systemd/mongo-backup.service \
  > /home/deploy/.config/systemd/user/mongo-backup.service
install -m 644 ./systemd/mongo-backup.timer /home/deploy/.config/systemd/user/mongo-backup.timer

systemctl --user daemon-reload
echo "Copied systemd service files and reloaded user daemon."
systemctl --user enable --now mongo-backup.timer

# The log level only applies to a newly started Podman API process: restart
# Podman's API service if it is running (its socket starts it again on the
# next request; containers are not affected).
systemctl --user try-restart podman.service || true

# Restart application pod (Mongo is in this pod but its volume persists)
systemctl --user restart webpage-pod.service
echo "Launched webpage pod."

# Restart observability pod
systemctl --user restart observability-pod.service
echo "Launched observability pod."

# Verify
systemctl --user status webpage-pod.service      --no-pager
systemctl --user status observability-pod.service --no-pager

# The pod unit stays "active" even when one of its containers exits (e.g.
# nginx refusing a bad config), so check each application container, and
# that it is still running a few seconds later. Failing here rolls back.
APP_SERVICES="mongo backend frontend nginx"
if [ "$MCP_ENABLED" = 1 ]; then APP_SERVICES="$APP_SERVICES mcp"; fi
all_active() {
  local svc
  for svc in $APP_SERVICES; do
    systemctl --user is-active --quiet "$svc.service" || return 1
  done
}
verify_running() {
  local svc
  for _ in $(seq 1 30); do
    if all_active; then
      sleep 5
      if all_active; then
        echo "Verified: $APP_SERVICES running."
        return 0
      fi
    fi
    sleep 2
  done
  echo "ERROR: application containers not running:"
  for svc in $APP_SERVICES; do
    echo "  $svc: $(systemctl --user is-active "$svc.service" || true)"
  done
  journalctl --user -u nginx.service -n 5 --no-pager || true
  return 1
}
verify_running

# --- Success: clean up -------------------------------------------------------
trap - ERR
rm -rf "$BACKUP_DIR"
echo "Backup removed."

# Remove registry tags of previously deployed app images (every deploy pulls
# two new SHA-tagged images), then delete images no tag points to any more.
# Older versions can still be pulled from ghcr.io by SHA for a manual rollback.
# Cleanup problems never fail a deployment that already succeeded.
CURRENT_BACKEND="${BACKEND_IMAGE:-}"
CURRENT_FRONTEND="${FRONTEND_IMAGE:-}"
CURRENT_MCP="${MCP_IMAGE:-}"
{
  for current in "$CURRENT_BACKEND" "$CURRENT_FRONTEND" "$CURRENT_MCP"; do
    [ -n "$current" ] || continue          # local mode: no registry images
    podman images --format '{{.Repository}}:{{.Tag}}' \
      | grep "^${current%:*}:" \
      | grep -vxF -e "$CURRENT_BACKEND" -e "$CURRENT_FRONTEND" -e "${CURRENT_MCP:-none}" \
      | xargs -r podman rmi
  done
  podman image prune -f
} >/dev/null 2>&1 || echo "WARNING: image cleanup did not complete."
echo "Pruned old images."

echo "Deployment complete: $(git rev-parse --short HEAD)."
