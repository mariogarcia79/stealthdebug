import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, KeyObject } from "crypto";
import { Types } from "mongoose";
import OAuthClientModel, { IOAuthClientDocument } from "../models/OAuthClient";
import OAuthGrantModel, { AGENT_SCOPES } from "../models/OAuthGrant";
import OAuthRequestModel from "../models/OAuthRequest";
import OAuthCodeModel from "../models/OAuthCode";
import RefreshTokenModel from "../models/RefreshToken";
import UserModel from "../models/User";
import { UserRole } from "../types/userRole";
import { env } from "../config/env";
import { readKey, signJwt, verifyJwt } from "../utils/edJwt";
import AgentService from "./agents.service";
import AuditService from "./audit.service";

// OAuth 2.1 authorization server for agents (MCP authorization spec):
// authorization code + PKCE (S256 only), exact redirect URIs, state,
// resource indicators (RFC 8707), pre-registered confidential clients,
// rotating refresh tokens with reuse detection. The token's subject is the
// agent, never the admin who approved it.

export const ACCESS_TOKEN_TTL = 10 * 60;               // seconds
export const REFRESH_TOKEN_TTL = 30 * 24 * 3600;       // seconds
const REQUEST_TTL_MS = 10 * 60 * 1000;                 // consent must happen within
const CODE_TTL_MS = 2 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

// An OAuth protocol error: error code (RFC 6749 §4.1.2.1, §5.2) + description
export class OAuthError extends Error {
  constructor(readonly code: string, readonly description: string, readonly status = 400) {
    super(description);
  }
}

let signingKey: KeyObject | null | undefined;
export function oauthSigningKey(): KeyObject | null {
  if (signingKey === undefined) {
    try {
      signingKey = env.oauthSigningKey ? readKey(env.oauthSigningKey, "private") : null;
    } catch (err) {
      console.error("OAUTH_SIGNING_KEY is not a valid Ed25519 private key:", err);
      signingKey = null;
    }
  }
  return signingKey;
}

// The redirect target for an authorization response (with RFC 9207 iss)
export function redirectWith(redirectUri: string, params: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("iss", env.oauthIssuer);
  return u.toString();
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function metadata() {
  const base = env.oauthIssuer;
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: [...AGENT_SCOPES],
    authorization_response_iss_parameter_supported: true,
    // Clients are registered by an admin: no dynamic registration, no
    // client ID metadata documents.
    client_id_metadata_document_supported: false,
  };
}

interface AuthorizeParams {
  response_type?: unknown; client_id?: unknown; redirect_uri?: unknown; state?: unknown;
  code_challenge?: unknown; code_challenge_method?: unknown; scope?: unknown; resource?: unknown;
}

class OAuthService {

  // GET /authorize. Returns the pending request's id (for the consent page),
  // or throws:
  //  - { redirect: false }: unknown client / redirect URI; never redirect
  //    there (it could be anyone's URL): show the error ourselves
  //  - { redirect: url }: other errors go back to the client, per RFC 6749
  static async startAuthorization(q: AuthorizeParams): Promise<string> {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const client = str(q.client_id)
      ? await OAuthClientModel.findOne({ clientId: str(q.client_id), revokedAt: null })
      : null;
    const agentOk = client && await UserModel.exists({ _id: client.agent, role: UserRole.AGENT, deletedAt: null });
    if (!client || !agentOk) throw { redirect: false, error: "invalid_client" };
    const redirectUri = str(q.redirect_uri);
    if (!client.redirectUris.includes(redirectUri)) throw { redirect: false, error: "invalid_redirect_uri" };

    const back = (error: string, description: string) => ({
      redirect: redirectWith(redirectUri, { error, error_description: description, ...(str(q.state) ? { state: str(q.state) } : {}) }),
    });

    if (q.response_type !== "code") throw back("unsupported_response_type", "response_type must be code");
    const state = str(q.state);
    if (!state || state.length > 500) throw back("invalid_request", "state is required");
    if (q.code_challenge_method !== "S256" || !PKCE_CHALLENGE.test(str(q.code_challenge))) {
      throw back("invalid_request", "PKCE with code_challenge_method=S256 is required");
    }
    // Clients must name the MCP server (RFC 8707); accept its canonical URI only
    const resource = str(q.resource) || env.mcpResource;
    if (resource !== env.mcpResource) throw back("invalid_target", "Unknown resource");
    const requested = str(q.scope) ? str(q.scope).split(" ").filter(Boolean) : [...AGENT_SCOPES];
    const scopes = [...new Set(requested)];
    if (!scopes.length || scopes.some((s) => !(AGENT_SCOPES as readonly string[]).includes(s))) {
      throw back("invalid_scope", `Supported scopes: ${AGENT_SCOPES.join(" ")}`);
    }

    const id = random();
    await OAuthRequestModel.create({
      _id: id,
      client: client._id,
      agent: client.agent,
      redirectUri,
      state,
      codeChallenge: str(q.code_challenge),
      scopes,
      resource,
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    });
    return id;
  }

  // What the consent page shows
  static async getRequest(id: string) {
    const r = typeof id === "string" ? await OAuthRequestModel.findOne({ _id: id, expiresAt: { $gt: new Date() } }).lean() : null;
    if (!r) return null;
    const [client, agent] = await Promise.all([
      OAuthClientModel.findById(r.client).select("name clientId").lean(),
      UserModel.findById(r.agent).select("name").lean(),
    ]);
    if (!client || !agent) return null;
    return { id: r._id, agent: agent.name, client: client.name, clientId: client.clientId, scopes: r.scopes, redirectUri: r.redirectUri, resource: r.resource };
  }

  // CSRF token for the consent form, bound to the admin, their session
  // (cookie) and this authorization request.
  static csrfToken(userId: string, sessionToken: string, requestId: string): string {
    return createHmac("sha256", `oauth-consent:${process.env.JWT_SECRET}`)
      .update(`${userId}|${sha256(sessionToken)}|${requestId}`)
      .digest("base64url");
  }

  static checkCsrf(given: unknown, userId: string, sessionToken: string, requestId: string): boolean {
    if (typeof given !== "string") return false;
    const a = Buffer.from(given);
    const b = Buffer.from(OAuthService.csrfToken(userId, sessionToken, requestId));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // The admin's decision. Returns where to send the browser: back to the
  // client with a code, or with error=access_denied.
  static async decide(requestId: string, adminId: string, approve: boolean): Promise<string> {
    // Consumed atomically: a request can be decided once
    const r = await OAuthRequestModel.findOneAndDelete({ _id: requestId, expiresAt: { $gt: new Date() } }).lean();
    if (!r) throw new OAuthError("invalid_request", "This authorization request has expired or was already used", 404);

    if (!approve) {
      await AuditService.log({ event: "grant_denied", admin: adminId, agent: r.agent });
      return redirectWith(r.redirectUri, { error: "access_denied", state: r.state });
    }

    const grant = await OAuthGrantModel.create({ agent: r.agent, client: r.client, scopes: r.scopes, approvedBy: adminId });
    const code = random();
    await OAuthCodeModel.create({
      codeHash: sha256(code),
      grant: grant._id,
      client: r.client,
      redirectUri: r.redirectUri,
      codeChallenge: r.codeChallenge,
      scopes: r.scopes,
      resource: r.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    await AuditService.log({ event: "grant_approved", admin: adminId, agent: r.agent, detail: r.scopes.join(" ") });
    return redirectWith(r.redirectUri, { code, state: r.state });
  }

  // Client authentication at the token and revocation endpoints
  static async authenticateClient(basic: string | undefined, body: Record<string, unknown>): Promise<IOAuthClientDocument> {
    let id: unknown = body.client_id;
    let secret: unknown = body.client_secret;
    if (basic?.startsWith("Basic ")) {
      const decoded = Buffer.from(basic.slice(6), "base64").toString();
      const i = decoded.indexOf(":");
      if (i < 0) throw new OAuthError("invalid_client", "Client authentication failed", 401);
      try {
        id = decodeURIComponent(decoded.slice(0, i).replace(/\+/g, " "));
        secret = decodeURIComponent(decoded.slice(i + 1).replace(/\+/g, " "));
      } catch {
        throw new OAuthError("invalid_client", "Client authentication failed", 401);
      }
    }
    const client = await AgentService.authenticateClient(id, secret);
    if (!client) throw new OAuthError("invalid_client", "Client authentication failed", 401);
    return client;
  }

  // POST /token
  static async token(client: IOAuthClientDocument, body: Record<string, unknown>) {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    if (body.resource !== undefined && body.resource !== env.mcpResource) {
      throw new OAuthError("invalid_target", "Unknown resource");
    }

    if (body.grant_type === "authorization_code") {
      const code = str(body.code);
      const record = code ? await OAuthCodeModel.findOne({ codeHash: sha256(code) }) : null;
      if (!record || !record.client.equals(client._id as Types.ObjectId)) throw new OAuthError("invalid_grant", "Invalid authorization code");
      // Single use: the first use claims it; a second one revokes what the
      // first produced (RFC 6749 §4.1.2)
      const claimed = await OAuthCodeModel.findOneAndUpdate({ _id: record._id, usedAt: null }, { $set: { usedAt: new Date() } });
      if (!claimed) {
        await OAuthService.revokeGrant(record.grant, "code_reuse");
        throw new OAuthError("invalid_grant", "Authorization code already used");
      }
      if (record.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Authorization code expired");
      if (str(body.redirect_uri) !== record.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match");
      const verifier = str(body.code_verifier);
      if (!PKCE_VERIFIER.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== record.codeChallenge) {
        throw new OAuthError("invalid_grant", "PKCE verification failed");
      }
      return OAuthService.issue(record.grant, client, record.scopes, record.resource);
    }

    if (body.grant_type === "refresh_token") {
      const token = str(body.refresh_token);
      const record = token ? await RefreshTokenModel.findOne({ tokenHash: sha256(token) }) : null;
      if (!record || !record.client.equals(client._id as Types.ObjectId)) throw new OAuthError("invalid_grant", "Invalid refresh token");
      const rotated = await RefreshTokenModel.findOneAndUpdate({ _id: record._id, usedAt: null }, { $set: { usedAt: new Date() } });
      if (!rotated) {
        // Reuse of a rotated token: it may have been stolen. Cut off the grant.
        await OAuthService.revokeGrant(record.grant, "refresh_reuse");
        throw new OAuthError("invalid_grant", "Refresh token already used; the authorization was revoked");
      }
      if (record.expiresAt < new Date()) throw new OAuthError("invalid_grant", "Refresh token expired");
      const result = await OAuthService.issue(record.grant, client, record.scopes, record.resource);
      await AuditService.log({ event: "token_refreshed", agent: client.agent });
      return result;
    }

    throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  }

  // Access token (JWT, audience = the MCP server) + a new refresh token
  private static async issue(grantId: Types.ObjectId, client: IOAuthClientDocument, scopes: string[], resource: string) {
    const key = oauthSigningKey();
    if (!key) throw new OAuthError("temporarily_unavailable", "Token signing is not configured", 503);
    const grant = await OAuthGrantModel.findOne({ _id: grantId, revokedAt: null, client: client._id }).lean();
    if (!grant) throw new OAuthError("invalid_grant", "The authorization was revoked");

    const accessToken = signJwt(
      {
        iss: env.oauthIssuer,
        aud: resource,
        sub: String(grant.agent),
        client_id: client.clientId,
        gid: String(grant._id),
        scope: scopes.join(" "),
        jti: random(16),
      },
      key,
      ACCESS_TOKEN_TTL,
      "at+jwt"
    );
    const refreshToken = random();
    await RefreshTokenModel.create({
      tokenHash: sha256(refreshToken),
      grant: grant._id,
      client: client._id,
      scopes,
      resource,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
    });
    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  // POST /revoke (RFC 7009): a refresh or access token of this client.
  // Revoking either ends the grant. Unknown tokens are not an error.
  static async revoke(client: IOAuthClientDocument, token: unknown): Promise<void> {
    if (typeof token !== "string" || !token) return;
    const refresh = await RefreshTokenModel.findOne({ tokenHash: sha256(token), client: client._id }).lean();
    if (refresh) return OAuthService.revokeGrant(refresh.grant, "client_revocation");
    const key = oauthSigningKey();
    if (!key) return;
    try {
      const c = verifyJwt(token, createPublicKey(key), { iss: env.oauthIssuer, aud: env.mcpResource, maxLifetime: ACCESS_TOKEN_TTL, typ: "at+jwt" });
      if (c.client_id === client.clientId && typeof c.gid === "string" && Types.ObjectId.isValid(c.gid)) {
        await OAuthService.revokeGrant(new Types.ObjectId(c.gid), "client_revocation");
      }
    } catch { /* not one of ours, or expired: nothing to revoke */ }
  }

  static async revokeGrant(grantId: Types.ObjectId, reason: string): Promise<void> {
    const g = await OAuthGrantModel.findOneAndUpdate({ _id: grantId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    if (g) await AuditService.log({ event: "token_revoked", agent: g.agent, detail: reason });
  }
}

export default OAuthService;
