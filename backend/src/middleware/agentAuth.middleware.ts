import { Request, Response, NextFunction } from "express";
import { KeyObject } from "crypto";
import OAuthGrantModel from "../models/OAuthGrant";
import OAuthClientModel from "../models/OAuthClient";
import UserModel from "../models/User";
import { UserRole } from "../types/userRole";
import { sendError } from "../config/errors";
import { env } from "../config/env";
import { readKey, verifyJwt } from "../utils/edJwt";
import { isObjectId } from "../utils/validation";
import AuditService from "../services/audit.service";

// The agent API is called only by the MCP server, never by browsers. Each
// request carries a short-lived service token signed with the MCP server's
// own Ed25519 key (not the agent's OAuth token, which never leaves the MCP
// server), naming the agent and the grant it is acting under:
//   Authorization: Bearer <JWT  iss=SERVICE_ISSUER aud=SERVICE_AUDIENCE
//                              sub=<agent id> gid=<grant id> scope="...">
// Then, on every call, the grant itself is checked here: it must exist, be
// unrevoked, belong to that agent and a live client, and include the scopes.
// So even with the MCP server's key, nothing beyond the agent rules can be
// done, and only through a grant an admin approved and hasn't revoked.
export const SERVICE_ISSUER = "stealthdebug-mcp";
export const SERVICE_AUDIENCE = "stealthdebug-agent-api";
export const SERVICE_TOKEN_MAX_LIFETIME = 120;   // seconds

let publicKey: KeyObject | null | undefined;
function key(): KeyObject | null {
  if (publicKey === undefined) {
    try {
      publicKey = env.agentApiPublicKey ? readKey(env.agentApiPublicKey, "public") : null;
    } catch (err) {
      console.error("AGENT_API_PUBLIC_KEY is not a valid Ed25519 public key:", err);
      publicKey = null;
    }
  }
  return publicKey;
}

// lastUsedAt is for the admin panel: at most one write a minute per grant
const LAST_USED_RESOLUTION_MS = 60_000;

export async function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  const k = key();
  if (!k) return sendError(res, "AGENT_API_DISABLED");

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return sendError(res, "MISSING_AUTH_TOKEN");

  let claims;
  try {
    claims = verifyJwt(token, k, { iss: SERVICE_ISSUER, aud: SERVICE_AUDIENCE, maxLifetime: SERVICE_TOKEN_MAX_LIFETIME });
  } catch {
    return sendError(res, "INVALID_TOKEN");
  }
  const agentId = claims.sub;
  const grantId = claims.gid;
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];
  if (!isObjectId(agentId) || typeof grantId !== "string" || !isObjectId(grantId)) return sendError(res, "INVALID_TOKEN");

  try {
    const grant = await OAuthGrantModel.findOne({ _id: grantId, agent: agentId, revokedAt: null }).lean();
    const [client, agent] = grant
      ? await Promise.all([
          OAuthClientModel.findOne({ _id: grant.client, agent: agentId, revokedAt: null }).select("_id").lean(),
          UserModel.findOne({ _id: agentId, role: UserRole.AGENT, deletedAt: null }).select("name").lean(),
        ])
      : [null, null];
    if (!grant || !client || !agent) return sendError(res, "INVALID_TOKEN");

    // The token can narrow the grant's scopes, never widen them
    const granted = scopes.filter((s) => (grant.scopes as string[]).includes(s));
    req.agent = { _id: agentId, name: agent.name, grantId, scopes: granted };

    if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      OAuthGrantModel.updateOne({ _id: grantId }, { $set: { lastUsedAt: new Date() } })
        .catch((err) => console.error("grant lastUsedAt:", err));
    }
  } catch (err) {
    return next(err);
  }
  next();
}

export const requireScope = (scope: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.agent) return sendError(res, "UNAUTHORIZED");
  if (!req.agent.scopes.includes(scope)) return sendError(res, "INSUFFICIENT_SCOPE");
  next();
};

// Audit entry for every agent API call, written when the response is sent:
// operation, agent, target post / change request, outcome (status). No
// bodies, no tokens.
// target: what :id is in this route
export const auditCall = (tool: string, target: "post" | "changeRequest" | "none" = "none") =>
  (req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    const id = req.params.id;
    const bodyPost = typeof req.body?.postId === "string" ? req.body.postId : undefined;
    AuditService.log({
      event: "tool_call",
      tool,
      agent: req.agent?._id,
      post: target === "post" ? id : bodyPost,
      changeRequest: target === "changeRequest" ? id : (res.locals.changeRequestId as string | undefined),
      outcome: res.statusCode < 400 ? "ok" : String(res.statusCode),
    });
  });
  next();
};
