#!/bin/bash

# check the user isnt root
if [ "$EUID" -eq 0 ]; then
  echo "Please do not run as root"
  exit
fi

# try to clean everything
rm -rf /home/deploy/.config/containers
echo "Cleaned previous deployment."

# clone from git
git pull origin main
echo "Updated source code from git."

# create directory structure under .config/
# create symlink to ~/.config/systemd/user
# assign appropiate permissions
mkdir -p /home/deploy/.config/containers/certs
mkdir -p /home/deploy/.config/containers/mongo
mkdir -p /home/deploy/.config/containers/nginx
mkdir -p /home/deploy/.config/containers/prometheus
mkdir -p /home/deploy/.config/containers/env
mkdir -p /home/deploy/.config/containers/systemd
ln -s /home/deploy/.config/containers/systemd /home/deploy/.config/systemd/user/
chmod -R 700 /home/deploy/.config/containers
chmod -R 700 /home/deploy/.config/systemd/user
echo "Created directory structure under ~/.config/containers and ~/.config/systemd/user."

# copy ./nginx to ~/.config/containers/nginx
# assign appropiate permissions
cp -r /home/deploy/.certs/* /home/deploy/.config/containers/certs/
cp -r ./nginx/* /home/deploy/.config/containers/nginx/
chmod -R 700 /home/deploy/.config/containers/nginx
chmod -R 700 /home/deploy/.config/containers/certs
./nginx/cloudflare-ip-whitelist-sync.sh
echo "Copied nginx configuration and certs."

# copy ./mongo to ~/.config/containers/mongo
# assign appropiate permissions
cp -r ./mongo/* /home/deploy/.config/containers/mongo/
chmod -R 700 /home/deploy/.config/containers/mongo
echo "Copied mongo configuration."

# copy ./prometheus to ~/.config/containers/prometheus
# assign appropiate permissions
cp -r /home/deploy/.prometheus/* /home/deploy/.config/containers/prometheus/
chmod -R 744 /home/deploy/.config/containers/prometheus
echo "Copied prometheus configuration."

# copy ~/env/* to ~/.config/containers/env
# assign appropiate permissions
cp -r /home/deploy/.env/* /home/deploy/.config/containers/env/
chmod -R 700 /home/deploy/.config/containers/env/
chmod 600 /home/deploy/.config/containers/env/*
echo "Copied environment variable files."

# copy ./services/* to ~/.config/containers/systemd/*
# reload systemctl user daemon
cp -r ./services/* /home/deploy/.config/containers/systemd/
chmod -R 700 /home/deploy/.config/containers/systemd/
chmod 600 /home/deploy/.config/containers/systemd/*.container
chmod 600 /home/deploy/.config/containers/systemd/*.volume
chmod 600 /home/deploy/.config/containers/systemd/*.network
chmod 600 /home/deploy/.config/containers/systemd/*.pod
systemctl --user daemon-reload
echo "Copied systemd service files and reloaded user daemon."

# build backend
podman build -t backend:latest ./backend/
echo "Built backend container image."

# build frontend
podman build -t frontend:latest ./frontend/
echo "Built frontend container image."

# launch the webpage pod
systemctl --user restart webpage-pod.service
echo "Launched webpage pod."

# launch the observability pod
systemctl --user restart observability-pod.service
echo "Launched observability pod."

# check status of the webpage pod
systemctl --user status webpage-pod.service --no-pager
echo "Checked status of webpage pod."

# check status of the observability pod
systemctl --user status observability-pod.service
echo "Checked status of observability pod."