#!/bin/bash
# Regenerates the nginx real-IP config from Cloudflare's published IP ranges.
# Exits non-zero (leaving the existing file untouched) if either list cannot
# be downloaded or contains no valid ranges.
set -euo pipefail

CLOUDFLARE_FILE_PATH=/home/deploy/.config/containers/nginx/cloudflare

# Regexes for valid CIDR notation
IPV4_CIDR_REGEX='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$'
IPV6_CIDR_REGEX='^[0-9a-fA-F:]+/[0-9]{1,3}$'

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# Download into variables (not `< <(curl ...)`): a failing command
# substitution in an assignment trips `set -e`, a process substitution does not.
fetch() {
  curl -s -L --fail --max-time 15 --retry 3 "$1"
}
if ! IPV4_LIST=$(fetch https://www.cloudflare.com/ips-v4); then
  echo "ERROR: could not download Cloudflare IPv4 ranges" >&2
  exit 1
fi
if ! IPV6_LIST=$(fetch https://www.cloudflare.com/ips-v6); then
  echo "ERROR: could not download Cloudflare IPv6 ranges" >&2
  exit 1
fi

# Writes one set_real_ip_from line per valid CIDR; prints the count to stdout.
emit() {
  local regex=$1 label=$2 list=$3 count=0 i
  while IFS= read -r i; do
    [ -n "$i" ] || continue
    if echo "$i" | grep -qE "$regex"; then
      echo "set_real_ip_from $i;" >> "$TMPFILE"
      count=$((count + 1))
    else
      echo "Warning: Skipping invalid $label CIDR: $i" >&2
    fi
  done <<< "$list"
  echo "$count"
}

{
  echo "#Cloudflare"
  echo ""
  echo "# - IPv4"
} > "$TMPFILE"
V4_COUNT=$(emit "$IPV4_CIDR_REGEX" IPv4 "$IPV4_LIST")

{
  echo ""
  echo "# - IPv6"
} >> "$TMPFILE"
V6_COUNT=$(emit "$IPV6_CIDR_REGEX" IPv6 "$IPV6_LIST")

if [ "$V4_COUNT" -eq 0 ] || [ "$V6_COUNT" -eq 0 ]; then
  echo "ERROR: Cloudflare returned no valid ranges (IPv4: $V4_COUNT, IPv6: $V6_COUNT)" >&2
  exit 1
fi

{
  echo ""
  echo "real_ip_header CF-Connecting-IP;"
} >> "$TMPFILE"

# Atomically replace the file only after successful generation
chmod 600 "$TMPFILE"
mv "$TMPFILE" "$CLOUDFLARE_FILE_PATH"
echo "Cloudflare IP whitelist updated: $CLOUDFLARE_FILE_PATH ($V4_COUNT IPv4, $V6_COUNT IPv6 ranges)"
