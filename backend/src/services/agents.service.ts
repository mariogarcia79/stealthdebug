import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Types } from "mongoose";
import UserModel from "../models/User";
import OAuthClientModel from "../models/OAuthClient";
import OAuthGrantModel from "../models/OAuthGrant";
import { UserRole } from "../types/userRole";
import { AppError } from "../config/errors";
import { isObjectId } from "../utils/validation";
import UserService from "./users.service";
import ChangeRequestService from "./changeRequests.service";
import AuditService from "./audit.service";

// Claude's connector callback (claude.ai custom connectors). Allowed by
// default for new agents; an admin can give others.
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const MAX_REDIRECT_URIS = 5;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Redirect URIs are compared exactly, so they must be exact: https (or
// http on localhost, for MCP Inspector), no fragment, no wildcards.
export function checkRedirectUri(uri: unknown): string {
  if (typeof uri !== "string" || uri.length > 500) throw new AppError("INVALID_INPUT", "Invalid redirect URI");
  let u: URL;
  try { u = new URL(uri); } catch { throw new AppError("INVALID_INPUT", `Invalid redirect URI: ${uri}`); }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if ((u.protocol !== "https:" && !local) || u.hash || u.username || u.password || uri.includes("*")) {
    throw new AppError("INVALID_INPUT", `Redirect URI must be https, without fragment or credentials: ${uri}`);
  }
  return uri;
}

class AgentService {

  // Creates the agent user and its OAuth client. The client secret is
  // returned here only; it can't be read again.
  static async register(adminId: string, opts: { name: string; redirectUris?: unknown[] }) {
    const uris = (opts.redirectUris?.length ? opts.redirectUris : [CLAUDE_CALLBACK]).map(checkRedirectUri);
    if (uris.length > MAX_REDIRECT_URIS) throw new AppError("INVALID_INPUT", `At most ${MAX_REDIRECT_URIS} redirect URIs`);

    const _id = new Types.ObjectId();
    let agent;
    try {
      agent = await UserModel.create({
        _id,
        name: opts.name,
        // Agents have no email and no password: a placeholder that can't
        // receive mail (.invalid, RFC 2606) and a "hash" bcrypt never matches.
        email: `agent-${_id}@agents.invalid`,
        hash: "!agent-no-password",
        role: UserRole.AGENT,
      });
    } catch (err) {
      throw UserService.duplicateToConflict(err);
    }

    const clientId = "sd-" + randomBytes(12).toString("base64url");
    const clientSecret = randomBytes(32).toString("base64url");
    await OAuthClientModel.create({
      clientId,
      secretHash: sha256(clientSecret),
      agent: agent._id,
      name: opts.name,
      redirectUris: uris,
      createdBy: adminId,
    });

    await AuditService.log({ event: "agent_registered", admin: adminId, agent: agent._id as Types.ObjectId, detail: opts.name });
    return { agent: { _id: agent._id, name: agent.name }, clientId, clientSecret, redirectUris: uris };
  }

  // Agents with their clients and grants (for the admin panel)
  static async list() {
    const agents = await UserModel.find({ role: UserRole.AGENT }).select("name createdAt deletedAt").sort({ createdAt: 1 }).lean();
    const ids = agents.map((a) => a._id);
    const [clients, grants] = await Promise.all([
      OAuthClientModel.find({ agent: { $in: ids } }).select("-secretHash").lean(),
      OAuthGrantModel.find({ agent: { $in: ids }, revokedAt: null }).populate("approvedBy", "name").lean(),
    ]);
    return agents.map((a) => ({
      ...a,
      clients: clients.filter((c) => c.agent.equals(a._id)),
      grants: grants.filter((g) => g.agent.equals(a._id)),
    }));
  }

  // Client credentials check (token endpoint). null if unknown, revoked, or
  // the agent was removed.
  static async authenticateClient(clientId: unknown, secret: unknown) {
    if (typeof clientId !== "string" || typeof secret !== "string") return null;
    const client = await OAuthClientModel.findOne({ clientId, revokedAt: null });
    const given = Buffer.from(sha256(secret));
    const stored = Buffer.from(client?.secretHash ?? sha256("no client"));
    if (!client || !timingSafeEqual(given, stored)) return null;
    const agent = await UserModel.findOne({ _id: client.agent, role: UserRole.AGENT, deletedAt: null }).select("_id").lean();
    return agent ? client : null;
  }

  private static async getAgent(id: string) {
    const agent = isObjectId(id) ? await UserModel.findOne({ _id: id, role: UserRole.AGENT }) : null;
    if (!agent) throw new AppError("USER_NOT_FOUND");
    return agent;
  }

  // Revokes every grant: the agent's refresh tokens stop working and its
  // access tokens are refused on the next call (the agent API checks the
  // grant every time). The agent can be connected again later.
  static async revokeTokens(adminId: string, agentId: string): Promise<number> {
    const agent = await AgentService.getAgent(agentId);
    const r = await OAuthGrantModel.updateMany({ agent: agent._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await AuditService.log({ event: "tokens_revoked", admin: adminId, agent: agent._id as Types.ObjectId, detail: `${r.modifiedCount} grants` });
    return r.modifiedCount;
  }

  // Removes an agent for good: tokens, clients and open change requests go;
  // the user stays (marked deleted) so its posts, comments and banners keep
  // their author.
  static async remove(adminId: string, agentId: string): Promise<void> {
    const agent = await AgentService.getAgent(agentId);
    if (agent.deletedAt) return;
    const now = new Date();
    await OAuthGrantModel.updateMany({ agent: agent._id, revokedAt: null }, { $set: { revokedAt: now } });
    await OAuthClientModel.updateMany({ agent: agent._id, revokedAt: null }, { $set: { revokedAt: now } });
    await ChangeRequestService.closeActive({ agent: agent._id as Types.ObjectId });
    agent.deletedAt = now;
    await agent.save();
    await AuditService.log({ event: "agent_deleted", admin: adminId, agent: agent._id as Types.ObjectId, detail: agent.name });
  }
}

export default AgentService;
