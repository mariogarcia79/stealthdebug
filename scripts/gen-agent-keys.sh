#!/bin/bash
# gen-agent-keys.sh: generates the two Ed25519 key pairs agents need and
# prints the env lines for backend.env and mcp.env (RUNBOOK §13).
#   1. OAuth access tokens: the backend signs (OAUTH_SIGNING_KEY), the MCP
#      server verifies (OAUTH_PUBLIC_KEY).
#   2. Service credential of the MCP server for the agent API: the MCP server
#      signs (AGENT_API_PRIVATE_KEY), the backend verifies (AGENT_API_PUBLIC_KEY).
# Keys are printed on one line with \n escapes (EnvironmentFile can't hold
# multi-line values; the apps turn \n back into newlines). Nothing is written
# to disk: paste the output into the env files, then clear the terminal.
set -euo pipefail
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
oneline() { awk 'BEGIN{ORS="\\n"} {print}' "$1"; }
pair() {
  openssl genpkey -algorithm ed25519 -out "$tmp/$1.key" 2>/dev/null
  openssl pkey -in "$tmp/$1.key" -pubout -out "$tmp/$1.pub"
}
pair oauth; pair service
echo "# ---- add to backend.env"
echo "OAUTH_SIGNING_KEY=$(oneline "$tmp/oauth.key")"
echo "AGENT_API_PUBLIC_KEY=$(oneline "$tmp/service.pub")"
echo
echo "# ---- add to mcp.env"
echo "OAUTH_PUBLIC_KEY=$(oneline "$tmp/oauth.pub")"
echo "AGENT_API_PRIVATE_KEY=$(oneline "$tmp/service.key")"
