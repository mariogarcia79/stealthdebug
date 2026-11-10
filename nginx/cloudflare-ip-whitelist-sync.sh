#!/bin/bash
set -euo pipefail

CLOUDFLARE_FILE_PATH=/home/deploy/.config/containers/nginx/cloudflare

# Regexes for valid CIDR notation
IPV4_CIDR_REGEX='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'
IPV6_CIDR_REGEX='^[0-9a-fA-F:]+/[0-9]{1,3}$'

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

echo "#Cloudflare" > "$TMPFILE"
echo "" >> "$TMPFILE"

echo "# - IPv4" >> "$TMPFILE"
while IFS= read -r i; do
    if echo "$i" | grep -qE "$IPV4_CIDR_REGEX"; then
        echo "set_real_ip_from $i;" >> "$TMPFILE"
    else
        echo "Warning: Skipping invalid IPv4 CIDR: $i" >&2
    fi
done < <(curl -s -L --fail --max-time 15 --retry 3 https://www.cloudflare.com/ips-v4)

echo "" >> "$TMPFILE"
echo "# - IPv6" >> "$TMPFILE"
while IFS= read -r i; do
    if echo "$i" | grep -qE "$IPV6_CIDR_REGEX"; then
        echo "set_real_ip_from $i;" >> "$TMPFILE"
    else
        echo "Warning: Skipping invalid IPv6 CIDR: $i" >&2
    fi
done < <(curl -s -L --fail --max-time 15 --retry 3 https://www.cloudflare.com/ips-v6)

echo "" >> "$TMPFILE"
echo "real_ip_header CF-Connecting-IP;" >> "$TMPFILE"

# Atomically replace the file only after successful generation
mv "$TMPFILE" "$CLOUDFLARE_FILE_PATH"
echo "Cloudflare IP whitelist updated: $CLOUDFLARE_FILE_PATH"
