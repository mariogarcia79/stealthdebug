import type { Request, Response, NextFunction } from "express";
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, mcpAuthMetadataRouter, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import type { Config } from "./config.js";
import { AgentApi } from "./backend.js";
import { buildServer } from "./server.js";
import { verifyJwt } from "./edJwt.js";

export const SCOPES = ["posts:read", "changes:write"];

// Access tokens from the blog's authorization server: EdDSA, typ at+jwt,
// iss = the blog, aud = this server. The verifier reports aud as the
// resource; requireBearerAuth compares it with ours (RFC 8707).
export function makeVerifier(config: Config) {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let c;
      try {
        c = verifyJwt(token, config.oauthPublicKey, { iss: config.issuer, aud: config.resource.href, maxLifetime: 900, typ: "at+jwt" });
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired access token");
      }
      if (typeof c.gid !== "string" || typeof c.client_id !== "string") {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");
      }
      return {
        token,
        clientId: c.client_id,
        scopes: typeof c.scope === "string" ? c.scope.split(" ").filter(Boolean) : [],
        expiresAt: c.exp,
        resource: new URL(c.aud as string),
        extra: { agentId: c.sub, grantId: c.gid },
      };
    },
  };
}

// Small per-agent limiter (the backend has its own limits too)
function rateLimiter(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60_000).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = String(req.auth?.extra?.agentId ?? req.ip);
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); return next(); }
    if (++e.n > perMinute) {
      res.setHeader("Retry-After", String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null });
    }
    next();
  };
}

export function createApp(config: Config, api = new AgentApi(config.agentApiUrl, config.servicePrivateKey)) {
  // Host and Origin validated before anything else (DNS rebinding, CSRF)
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    allowedHosts: [config.resource.hostname],
    allowedOrigins: config.allowedOrigins.length ? config.allowedOrigins : [config.resource.hostname],
    jsonLimit: "200kb",
  });
  app.disable("x-powered-by");

  // RFC 9728 protected resource metadata (+ the AS metadata, mirrored)
  const base = config.issuer;
  app.use(mcpAuthMetadataRouter({
    resourceServerUrl: config.resource,
    resourceName: "stealthdebug.org",
    scopesSupported: SCOPES,
    oauthMetadata: {
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      scopes_supported: SCOPES,
    },
  }));

  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });

  const auth = requireBearerAuth({
    verifier: makeVerifier(config),
    expectedResource: config.resource,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(config.resource),
  });

  const handler = toNodeHandler(createMcpHandler((ctx) => {
    const info = ctx.authInfo;
    const extra = (info?.extra ?? {}) as { agentId?: string; grantId?: string };
    if (!info || !extra.agentId || !extra.grantId) throw new Error("unauthenticated request reached the MCP handler");
    return buildServer(api, { agentId: extra.agentId, grantId: extra.grantId, scopes: info.scopes });
  }));

  app.all(config.resource.pathname, auth, rateLimiter(config.rateLimit), (req, res) => void handler(req, res, req.body));
  return app;
}
