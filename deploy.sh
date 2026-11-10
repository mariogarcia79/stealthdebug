#!/bin/bash
# deploy.sh — deploys the application on the VPS.
#
# CI mode (called by GitHub Actions):
#   BACKEND_IMAGE and FRONTEND_IMAGE env vars must be set to the full
#   ghcr.io image references. The script pulls those images instead of
#   building locally, then rewrites the quadlet Image= directives before
#   copying them to ~/.config/containers/systemd/.
#
# Local mode (called manually):
#   BACKEND_IMAGE and FRONTEND_IMAGE are unset. The script builds the
#   images locally with podman build, using localhost/ references.
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "Please do not run as root"
  exit 1
fi

BACKUP_DIR="/home/deploy/.config/containers.backup.$(date +%s)"

# Snapshot existing config for rollback
if [ -d /home/deploy/.config/containers ]; then
  cp -r /home/deploy/.config/containers "$BACKUP_DIR"
  echo "Backed up existing deployment to $BACKUP_DIR"
fi

rollback() {
  echo "ERROR: Deployment failed. Rolling back to previous state..."
  rm -rf /home/deploy/.config/containers
  if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" /home/deploy/.config/containers
    systemctl --user daemon-reload
    systemctl --user restart webpage-pod.service    || true
    systemctl --user restart observability-pod.service || true
    echo "Rollback complete."
  else
    echo "No backup to restore."
  fi
  exit 1
}

trap rollback ERR

# Clean previous config (volumes are stored separately and are NOT affected)
rm -rf /home/deploy/.config/containers
echo "Cleaned previous deployment."

# Pull latest config from git
git pull origin main
echo "Updated source code from git."

# Create directory structure
mkdir -p /home/deploy/.config/containers/certs
mkdir -p /home/deploy/.config/containers/mongo
mkdir -p /home/deploy/.config/containers/nginx
mkdir -p /home/deploy/.config/containers/prometheus
mkdir -p /home/deploy/.config/containers/env
mkdir -p /home/deploy/.config/containers/systemd
mkdir -p /home/deploy/.config/systemd/user

# Remove dangling symlink before (re)creating it
rm -f /home/deploy/.config/systemd/user
ln -s /home/deploy/.config/containers/systemd /home/deploy/.config/systemd/user

chmod -R 700 /home/deploy/.config/containers
chmod -R 700 /home/deploy/.config/systemd/user
echo "Created directory structure."

# Copy config files
cp -r /home/deploy/.certs/* /home/deploy/.config/containers/certs/
cp -r ./nginx/*              /home/deploy/.config/containers/nginx/
chmod -R 700 /home/deploy/.config/containers/nginx
chmod -R 700 /home/deploy/.config/containers/certs
./nginx/cloudflare-ip-whitelist-sync.sh
echo "Copied nginx configuration and certs."

cp -r ./mongo/* /home/deploy/.config/containers/mongo/
chmod -R 700 /home/deploy/.config/containers/mongo
echo "Copied mongo configuration."

cp -r /home/deploy/.prometheus/* /home/deploy/.config/containers/prometheus/
chmod -R 744 /home/deploy/.config/containers/prometheus
echo "Copied prometheus configuration."

cp -r /home/deploy/.env/* /home/deploy/.config/containers/env/
chmod -R 700 /home/deploy/.config/containers/env/
chmod 600 /home/deploy/.config/containers/env/*
echo "Copied environment variable files."

# Copy quadlet service files, then patch Image= directives if running in CI mode
cp -r ./services/* /home/deploy/.config/containers/systemd/

if [ -n "${BACKEND_IMAGE:-}" ] && [ -n "${FRONTEND_IMAGE:-}" ]; then
  echo "CI mode: pulling pre-built images from registry..."

  # Authenticate to ghcr.io if a token is provided
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | podman login ghcr.io \
      --username "$(echo "$BACKEND_IMAGE" | cut -d'/' -f2)" \
      --password-stdin
  fi

  podman pull "$BACKEND_IMAGE"
  podman pull "$FRONTEND_IMAGE"

  # Retag to the localhost names the quadlet files reference by default,
  # so no quadlet file changes are needed in the repo.
  podman tag "$BACKEND_IMAGE"  localhost/backend:latest
  podman tag "$FRONTEND_IMAGE" localhost/frontend:latest

  echo "Pulled and tagged images as localhost/backend:latest and localhost/frontend:latest."
else
  echo "Local mode: building images with podman build..."
  podman build -t backend:latest  ./backend/
  podman build -t frontend:latest ./frontend/
  echo "Built backend and frontend images."
fi

chmod -R 700 /home/deploy/.config/containers/systemd/
chmod 600 /home/deploy/.config/containers/systemd/*.container
chmod 600 /home/deploy/.config/containers/systemd/*.volume
chmod 600 /home/deploy/.config/containers/systemd/*.network
chmod 600 /home/deploy/.config/containers/systemd/*.pod
systemctl --user daemon-reload
echo "Copied systemd service files and reloaded user daemon."

# Restart application pod (Mongo is in this pod but its volume persists)
systemctl --user restart webpage-pod.service
echo "Launched webpage pod."

# Restart observability pod
systemctl --user restart observability-pod.service
echo "Launched observability pod."

# Verify
systemctl --user status webpage-pod.service      --no-pager
systemctl --user status observability-pod.service --no-pager

# Remove backup on success
rm -rf "$BACKUP_DIR"
echo "Deployment complete. Backup removed."
