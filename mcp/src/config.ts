import { KeyObject } from "node:crypto";
import { readKey } from "./edJwt.js";

// Configuration from the environment, checked at startup.
export interface Config {
  port: number;
  // Canonical URI of this server (RFC 8707): the audience of its tokens and
  // the URL agents connect to. Its path is the MCP endpoint.
  resource: URL;
  // The authorization server (the blog's backend) and the public half of its
  // access-token signing key
  issuer: string;
  oauthPublicKey: KeyObject;
  // The backend's agent API and this server's own service key for it
  agentApiUrl: string;
  servicePrivateKey: KeyObject;
  // Browser origins allowed to call (hostnames); none needed for claude.ai,
  // whose servers connect without an Origin header
  allowedOrigins: string[];
  // Requests per minute per agent
  rateLimit: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`FATAL: ${name} must be set`);
  return v;
}

export function loadConfig(env = process.env): Config {
  const resource = new URL(env.MCP_RESOURCE || "https://mcp.stealthdebug.org/mcp");
  return {
    port: Number(env.PORT) || 4100,
    resource,
    issuer: (env.OAUTH_ISSUER || "https://stealthdebug.org").replace(/\/+$/, ""),
    oauthPublicKey: readKey(required("OAUTH_PUBLIC_KEY"), "public"),
    agentApiUrl: (env.AGENT_API_URL || "http://backend:4000/api/agent").replace(/\/+$/, ""),
    servicePrivateKey: readKey(required("AGENT_API_PRIVATE_KEY"), "private"),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
    rateLimit: Number(env.MCP_RATE_LIMIT) || 120,
  };
}
