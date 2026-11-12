import { KeyObject } from "node:crypto";
import { signJwt } from "./edJwt.js";

// Client of the backend's agent API (backend/src/routes/agentApi.routes.ts).
// Every call carries a fresh, short service token signed with this server's
// own key, naming the agent and the grant from the verified access token.
// The agent's access token itself is never sent anywhere.

export const SERVICE_ISSUER = "stealthdebug-mcp";
export const SERVICE_AUDIENCE = "stealthdebug-agent-api";

export interface Caller {
  agentId: string;
  grantId: string;
  scopes: string[];
}

export class BackendError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export class AgentApi {
  constructor(private baseUrl: string, private key: KeyObject, private fetchImpl: typeof fetch = fetch) {}

  async call<T>(caller: Caller, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = signJwt(
      { iss: SERVICE_ISSUER, aud: SERVICE_AUDIENCE, sub: caller.agentId, gid: caller.grantId, scope: caller.scopes.join(" ") },
      this.key,
      60
    );
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BackendError(503, "The blog is not reachable right now");
    }
    const text = await res.text();
    let json: unknown = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
    if (!res.ok) {
      const message = (json as { error?: unknown })?.error;
      throw new BackendError(res.status, typeof message === "string" ? message : `HTTP ${res.status}`);
    }
    return json as T;
  }
}
