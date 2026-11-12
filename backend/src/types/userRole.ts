export enum UserRole {
  ADMIN = "admin",
  USER = "user",
  // AI agent (e.g. "Claude"): no password, no cookie session. Its only access
  // is the agent API (routes/agentApi.routes.ts), through the MCP server.
  AGENT = "agent"
}
