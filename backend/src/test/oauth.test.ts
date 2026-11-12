import request from "supertest";
import { createHash, randomBytes } from "crypto";
import app from "../app";
import OAuthGrantModel from "../models/OAuthGrant";
import AuditLogModel from "../models/AuditLog";
import AgentService from "../services/agents.service";
import { UserRole } from "../types/userRole";
import { readKey, verifyJwt } from "../utils/edJwt";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, agentAuth } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = "https://mcp.stealthdebug.test/mcp";
const ISSUER = "https://stealthdebug.test";
const publicKey = readKey(process.env.TEST_OAUTH_PUBLIC_KEY!, "public");

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function setup() {
  const admin = await createUser(UserRole.ADMIN, "mario");
  const reg = await AgentService.register(String(admin._id), { name: "Claude" });
  return { admin, ...reg, cookie: cookieFor(admin) };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function authorizeUrl(ctx: Ctx, p: { challenge: string }, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({
    response_type: "code", client_id: ctx.clientId, redirect_uri: CALLBACK, state: "st-123",
    code_challenge: p.challenge, code_challenge_method: "S256", resource: RESOURCE, ...extra,
  });
  return `/api/oauth/authorize?${q}`;
}

// The whole browser part: authorize -> consent page -> approve. Returns the code.
async function getCode(ctx: Ctx, p = pkce(), extra: Record<string, string> = {}) {
  const auth = await request(app).get(authorizeUrl(ctx, p, extra));
  expect(auth.status).toBe(302);
  const requestId = new URL(auth.headers.location, "https://x").searchParams.get("request")!;
  const view = await request(app).get(`/api/oauth/requests/${requestId}`).set("Cookie", ctx.cookie);
  const decision = await request(app).post(`/api/oauth/requests/${requestId}/decision`).set("Cookie", ctx.cookie)
    .send({ approve: true, csrf: view.body.csrf });
  expect(decision.status).toBe(200);
  const back = new URL(decision.body.redirect);
  return { code: back.searchParams.get("code")!, back, p, view };
}

const token = (ctx: Ctx, body: Record<string, string>, basic = true) => {
  const r = request(app).post("/api/oauth/token").type("form");
  return basic
    ? r.auth(ctx.clientId, ctx.clientSecret).send(body)
    : r.send({ ...body, client_id: ctx.clientId, client_secret: ctx.clientSecret });
};

describe("metadata", () => {
  test("RFC 8414 document at the root, S256 only, no registration endpoint", async () => {
    const res = await request(app).get("/.well-known/oauth-authorization-server");
    expect(res.body).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    });
    expect(res.body.registration_endpoint).toBeUndefined();
  });
});

describe("authorize", () => {
  test("unknown client or redirect URI: our own error page, never a redirect to it", async () => {
    const ctx = await setup();
    const p = pkce();
    const bad1 = await request(app).get(authorizeUrl(ctx, p, { client_id: "nope" }));
    const bad2 = await request(app).get(authorizeUrl(ctx, p, { redirect_uri: "https://evil.example/cb" }));
    const bad3 = await request(app).get(authorizeUrl(ctx, p, { redirect_uri: CALLBACK + "/" }));   // exact match
    for (const r of [bad1, bad2, bad3]) {
      expect(r.status).toBe(302);
      expect(r.headers.location).toMatch(/^\/oauth\/consent\?error=/);
    }
  });

  test("other errors go back to the client with state and iss", async () => {
    const ctx = await setup();
    const p = pkce();
    const cases: [Record<string, string>, string][] = [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: "short" }, "invalid_request"],
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ resource: "https://other.example/mcp" }, "invalid_target"],
      [{ scope: "posts:read admin" }, "invalid_scope"],
    ];
    for (const [extra, error] of cases) {
      const r = await request(app).get(authorizeUrl(ctx, p, extra));
      const u = new URL(r.headers.location);
      expect(u.origin + u.pathname).toBe(CALLBACK);
      expect(u.searchParams.get("error")).toBe(error);
      expect(u.searchParams.get("state")).toBe("st-123");
      expect(u.searchParams.get("iss")).toBe(ISSUER);
    }
    const noState = await request(app).get(authorizeUrl(ctx, p, { state: "" }));
    expect(new URL(noState.headers.location).searchParams.get("error")).toBe("invalid_request");
  });

  test("consent: admins only, CSRF bound to session and request, one decision", async () => {
    const ctx = await setup();
    const user = await createUser();
    const auth = await request(app).get(authorizeUrl(ctx, pkce()));
    const id = new URL(auth.headers.location, "https://x").searchParams.get("request")!;

    expect((await request(app).get(`/api/oauth/requests/${id}`)).status).toBe(401);
    const asUser = await request(app).get(`/api/oauth/requests/${id}`).set("Cookie", cookieFor(user));
    expect(asUser.status).toBe(403);
    expect(asUser.body.error).toMatch(/administrator/);

    const view = await request(app).get(`/api/oauth/requests/${id}`).set("Cookie", ctx.cookie);
    expect(view.body).toMatchObject({ agent: "Claude", client: "Claude", scopes: ["posts:read", "changes:write"], redirectUri: CALLBACK });

    const decide = (cookie: string, csrf: unknown) =>
      request(app).post(`/api/oauth/requests/${id}/decision`).set("Cookie", cookie).send({ approve: true, csrf });
    expect((await decide(ctx.cookie, "forged")).status).toBe(403);
    expect((await decide(ctx.cookie, undefined)).status).toBe(403);
    // the same admin with another session (another cookie): the token doesn't carry over
    const otherSession = cookieFor({ ...ctx.admin.toObject(), email: "other-session" } as never);
    expect((await decide(otherSession, view.body.csrf)).status).toBe(403);
    expect((await decide(ctx.cookie, view.body.csrf)).status).toBe(200);
    expect((await decide(ctx.cookie, view.body.csrf)).status).toBe(404);   // already decided
  });

  test("deny: access_denied back to the client, no grant", async () => {
    const ctx = await setup();
    const auth = await request(app).get(authorizeUrl(ctx, pkce()));
    const id = new URL(auth.headers.location, "https://x").searchParams.get("request")!;
    const view = await request(app).get(`/api/oauth/requests/${id}`).set("Cookie", ctx.cookie);
    const res = await request(app).post(`/api/oauth/requests/${id}/decision`).set("Cookie", ctx.cookie).send({ approve: false, csrf: view.body.csrf });
    const u = new URL(res.body.redirect);
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("state")).toBe("st-123");
    expect(await OAuthGrantModel.countDocuments()).toBe(0);
  });
});

describe("token", () => {
  test("code + PKCE -> access token for the agent, audience the MCP server", async () => {
    const ctx = await setup();
    const { code, back, p } = await getCode(ctx);
    expect(back.searchParams.get("state")).toBe("st-123");
    expect(back.searchParams.get("iss")).toBe(ISSUER);
    const res = await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier, resource: RESOURCE });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({ token_type: "Bearer", expires_in: 600, scope: "posts:read changes:write" });
    const claims = verifyJwt(res.body.access_token, publicKey, { iss: ISSUER, aud: RESOURCE, maxLifetime: 900, typ: "at+jwt" });
    expect(claims.sub).toBe(String(ctx.agent._id));        // the agent, not the admin
    expect(claims.sub).not.toBe(String(ctx.admin._id));
    expect(claims.client_id).toBe(ctx.clientId);
    // and the grant it names works on the agent API
    const grantOk = await request(app).get("/api/agent/posts").set("Authorization", agentAuth({ agent: ctx.agent, grant: { _id: claims.gid } }));
    expect(grantOk.status).toBe(200);
  });

  test("client_secret_post works too; wrong secret is invalid_client", async () => {
    const ctx = await setup();
    const { code, p } = await getCode(ctx);
    const bad = await request(app).post("/api/oauth/token").type("form").auth(ctx.clientId, "wrong")
      .send({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe("invalid_client");
    const ok = await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier }, false);
    expect(ok.status).toBe(200);
  });

  test("wrong verifier, redirect URI, resource or client", async () => {
    const ctx = await setup();
    const other = await AgentService.register(String(ctx.admin._id), { name: "Other" });
    const cases: [Record<string, string>, string][] = [
      [{ code_verifier: pkce().verifier }, "invalid_grant"],
      [{ redirect_uri: "https://claude.ai/other" }, "invalid_grant"],
      [{ resource: "https://other.example/mcp" }, "invalid_target"],
    ];
    for (const [extra, error] of cases) {
      const { code, p } = await getCode(ctx);
      const res = await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier, ...extra });
      expect(res.body.error).toBe(error);
    }
    const { code, p } = await getCode(ctx);
    const stolen = await request(app).post("/api/oauth/token").type("form").auth(other.clientId, other.clientSecret)
      .send({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier });
    expect(stolen.body.error).toBe("invalid_grant");
  });

  test("a code works once; reusing it revokes the grant", async () => {
    const ctx = await setup();
    const { code, p } = await getCode(ctx);
    const body = { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier };
    const first = await token(ctx, body);
    expect(first.status).toBe(200);
    expect((await token(ctx, body)).body.error).toBe("invalid_grant");
    const refreshed = await token(ctx, { grant_type: "refresh_token", refresh_token: first.body.refresh_token });
    expect(refreshed.body.error).toBe("invalid_grant");
  });

  test("refresh rotates; reusing an old refresh token revokes the whole grant", async () => {
    const ctx = await setup();
    const { code, p } = await getCode(ctx);
    const t1 = (await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier })).body;
    const t2 = await token(ctx, { grant_type: "refresh_token", refresh_token: t1.refresh_token });
    expect(t2.status).toBe(200);
    expect(t2.body.refresh_token).not.toBe(t1.refresh_token);
    const t3 = await token(ctx, { grant_type: "refresh_token", refresh_token: t2.body.refresh_token });
    expect(t3.status).toBe(200);

    // the stolen t1 is replayed
    const replay = await token(ctx, { grant_type: "refresh_token", refresh_token: t1.refresh_token });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    // ... and the legitimate latest token is dead too
    expect((await token(ctx, { grant_type: "refresh_token", refresh_token: t3.body.refresh_token })).body.error).toBe("invalid_grant");
    expect(await OAuthGrantModel.countDocuments({ revokedAt: null })).toBe(0);
    expect(await AuditLogModel.exists({ event: "token_revoked", detail: "refresh_reuse" })).toBeTruthy();
  });

  test("revocation: admin panel and RFC 7009 endpoint", async () => {
    const ctx = await setup();
    const issue = async () => {
      const { code, p } = await getCode(ctx);
      return (await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier })).body;
    };
    const a = await issue();
    await AgentService.revokeTokens(String(ctx.admin._id), String(ctx.agent._id));
    expect((await token(ctx, { grant_type: "refresh_token", refresh_token: a.refresh_token })).body.error).toBe("invalid_grant");

    const b = await issue();
    const rev = await request(app).post("/api/oauth/revoke").type("form").auth(ctx.clientId, ctx.clientSecret).send({ token: b.access_token });
    expect(rev.status).toBe(200);
    expect((await token(ctx, { grant_type: "refresh_token", refresh_token: b.refresh_token })).body.error).toBe("invalid_grant");
    expect((await request(app).post("/api/oauth/revoke").type("form").auth(ctx.clientId, ctx.clientSecret).send({ token: "unknown" })).status).toBe(200);
  });

  test("a removed agent or revoked client can't get tokens", async () => {
    const ctx = await setup();
    const { code, p } = await getCode(ctx);
    await AgentService.remove(String(ctx.admin._id), String(ctx.agent._id));
    const res = await token(ctx, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: p.verifier });
    expect(res.status).toBe(401);
    const again = await request(app).get(authorizeUrl(ctx, pkce()));
    expect(again.headers.location).toMatch(/error=invalid_client/);
  });

  test("bad grant_type and missing client auth", async () => {
    const ctx = await setup();
    expect((await token(ctx, { grant_type: "password" })).body.error).toBe("unsupported_grant_type");
    expect((await request(app).post("/api/oauth/token").type("form").send({ grant_type: "refresh_token" })).status).toBe(401);
  });
});
