// Configuration read from the environment, checked once at startup. Import
// values from here instead of reading process.env across the code.
// (index.ts loads .env with dotenv before anything imports this module.)

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`FATAL: ${name} environment variable must be set`);
  return value;
}

export const env = {
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT) || 4000,
  // Public address of the site (sitemap and other absolute URLs)
  siteUrl: (process.env.SITE_URL || "https://stealthdebug.org").replace(/\/+$/, ""),
  // Public key (PEM, Ed25519) of the MCP server's service credential. Unset:
  // the agent API answers 503.
  agentApiPublicKey: process.env.AGENT_API_PUBLIC_KEY || "",
  // OAuth authorization server (agents connecting through the MCP server)
  oauthIssuer: (process.env.OAUTH_ISSUER || process.env.SITE_URL || "https://stealthdebug.org").replace(/\/+$/, ""),
  // Private key (PEM, Ed25519) signing access tokens; the MCP server has the
  // public half. Unset: the token endpoint answers 503.
  oauthSigningKey: process.env.OAUTH_SIGNING_KEY || "",
  // Canonical URI of the MCP server (RFC 8707 resource, the tokens' audience)
  mcpResource: process.env.MCP_RESOURCE || "https://mcp.stealthdebug.org/mcp",
  // Where the backend reads the frontend's index.html, to serve post pages
  // with their meta tags (same pod: the container's name)
  frontendUrl: (process.env.FRONTEND_URL || "http://frontend").replace(/\/+$/, ""),
  // IndexNow key (8-128 letters, digits, dashes): when set, search engines
  // that support IndexNow (Bing, Yandex, Seznam...) are told which URLs
  // changed as soon as a post is published, edited or unpublished. Unset: off.
  indexNowKey: /^[A-Za-z0-9-]{8,128}$/.test(process.env.INDEXNOW_KEY || "") ? process.env.INDEXNOW_KEY! : "",
  // Limits for agents' change requests
  maxOpenChangeRequests: Number(process.env.MAX_OPEN_CHANGE_REQUESTS) || 10,
} as const;
