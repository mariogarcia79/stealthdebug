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
  // Limits for agents' change requests
  maxOpenChangeRequests: Number(process.env.MAX_OPEN_CHANGE_REQUESTS) || 10,
} as const;
