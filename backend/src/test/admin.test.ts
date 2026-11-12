import request from "supertest";
import app from "../app";
import PostModel from "../models/Post";
import { registry } from "../config/metrics";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createAgent, agentAuth } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

async function admin() {
  const user = await createUser(UserRole.ADMIN, "mario");
  const cookie = cookieFor(user);
  const csrf = (await request(app).get("/api/admin/csrf").set("Cookie", cookie)).body.csrf as string;
  const as = {
    get: (url: string) => request(app).get(url).set("Cookie", cookie),
    post: (url: string, body: object = {}) => request(app).post(url).set("Cookie", cookie).set("X-CSRF-Token", csrf).send(body),
    put: (url: string, body: object) => request(app).put(url).set("Cookie", cookie).set("X-CSRF-Token", csrf).send(body),
    del: (url: string) => request(app).delete(url).set("Cookie", cookie).set("X-CSRF-Token", csrf),
  };
  return { user, cookie, csrf, as };
}

describe("admin API", () => {
  test("admins only; every change needs the CSRF token of this session", async () => {
    const { user, cookie, csrf } = await admin();
    const reader = await createUser();
    expect((await request(app).get("/api/admin/agents").set("Cookie", cookieFor(reader))).status).toBe(403);
    expect((await request(app).get("/api/admin/agents")).status).toBe(401);
    expect((await request(app).post("/api/admin/agents").set("Cookie", cookie).send({ name: "Claude" })).status).toBe(403);
    expect((await request(app).post("/api/admin/agents").set("Cookie", cookie).set("X-CSRF-Token", "forged").send({ name: "Claude" })).status).toBe(403);
    const otherSession = cookieFor({ ...user.toObject(), email: "x" } as never);
    expect((await request(app).post("/api/admin/agents").set("Cookie", otherSession).set("X-CSRF-Token", csrf).send({ name: "Claude" })).status).toBe(403);
    expect((await request(app).post("/api/admin/agents").set("Cookie", cookie).set("X-CSRF-Token", csrf).send({ name: "Claude" })).status).toBe(201);
  });

  test("agents: register shows the secret once; list never does; revoke; remove", async () => {
    const { as } = await admin();
    const reg = await as.post("/api/admin/agents", { name: "Claude" });
    expect(reg.body).toMatchObject({ clientId: expect.stringMatching(/^sd-/), clientSecret: expect.any(String), redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(reg.headers["cache-control"]).toBe("no-store");
    const list = await as.get("/api/admin/agents");
    expect(list.body[0]).toMatchObject({ name: "Claude", deletedAt: null, clients: [{ clientId: reg.body.clientId }] });
    expect(JSON.stringify(list.body)).not.toContain(reg.body.clientSecret);
    expect(JSON.stringify(list.body)).not.toContain("secretHash");
    expect((await as.post("/api/admin/agents", { name: "Claude" })).status).toBe(409);
    expect((await as.post("/api/admin/agents", { name: "X", redirectUris: ["http://evil.example/cb"] })).status).toBe(400);
    const id = reg.body.agent._id;
    expect((await as.post(`/api/admin/agents/${id}/revoke`)).body).toEqual({ revoked: 0 });
    expect((await as.del(`/api/admin/agents/${id}`)).status).toBe(204);
    expect((await as.get("/api/admin/agents")).body[0].deletedAt).toBeTruthy();
  });

  test("change requests: list by kind/status, detail with the post to diff against, accept, decline", async () => {
    const { user, as } = await admin();
    const a = await createAgent(user._id, "Claude");
    const post = await createPost(user._id, { title: "Original", content: "line 1\nline 2" });
    const propose = (body: object) => request(app).post("/api/agent/change-requests").set("Authorization", agentAuth(a)).send(body);
    const edit = (await propose({ kind: "edit", postId: String(post._id), fields: { content: "line 1\nline two" }, description: "typo" })).body;
    const nw = (await propose({ kind: "new", fields: { title: "New", summary: "S", content: "C" }, description: "d" })).body;

    const edits = await as.get("/api/admin/change-requests?kind=edit&status=open");
    expect(edits.body).toHaveLength(1);
    expect(edits.body[0]).toMatchObject({ kind: "edit", agent: { name: "Claude" }, post: { title: "Original" }, revisions: 1, description: "typo" });
    expect((await as.get("/api/admin/change-requests?kind=bogus")).status).toBe(400);

    const detail = await as.get(`/api/admin/change-requests/${edit.id}`);
    expect(detail.body.target).toMatchObject({ title: "Original", content: "line 1\nline 2", contentHash: expect.stringMatching(/^sha256:/) });
    expect(detail.body.changeRequest.revisions[0].fields.content).toBe("line 1\nline two");
    expect((await as.get(`/api/admin/change-requests/${nw.id}`)).body.target).toBeNull();

    expect((await as.post(`/api/admin/change-requests/${edit.id}/accept`, {})).status).toBe(400);
    const accepted = await as.post(`/api/admin/change-requests/${edit.id}/accept`, { revision: 1 });
    expect(accepted.body.status).toBe("accepted");
    expect(accepted.body.review).toMatchObject({ decision: "accepted", byName: "mario" });
    expect((await PostModel.findById(post._id))?.content).toBe("line 1\nline two");

    expect((await as.post(`/api/admin/change-requests/${nw.id}/decline`, { comment: " " })).status).toBe(400);
    const declined = await as.post(`/api/admin/change-requests/${nw.id}/decline`, { comment: "Too short" });
    expect(declined.body).toMatchObject({ status: "declined", review: { comment: "Too short", byName: "mario" } });
  });

  test("guidelines: versions and history", async () => {
    const { as } = await admin();
    expect((await as.get("/api/admin/guidelines")).body).toMatchObject({ version: 0, content: "", history: [] });
    await as.put("/api/admin/guidelines", { content: "v1" });
    await as.put("/api/admin/guidelines", { content: "v2" });
    const g = await as.get("/api/admin/guidelines");
    expect(g.body).toMatchObject({ version: 2, content: "v2" });
    expect(g.body.history.map((h: { version: number; savedBy: { name: string } }) => [h.version, h.savedBy.name])).toEqual([[2, "mario"], [1, "mario"]]);
    expect((await as.get("/api/admin/guidelines/1")).body.content).toBe("v1");
    expect((await as.put("/api/admin/guidelines", { content: 5 })).status).toBe(400);
  });

  test("audit log with names; metrics count tool calls", async () => {
    const { user, as } = await admin();
    const a = await createAgent(user._id, "Claude");
    await request(app).get("/api/agent/posts").set("Authorization", agentAuth(a));
    await request(app).get("/api/agent/posts/0123456789abcdef01234567").set("Authorization", agentAuth(a));
    await new Promise((r) => setTimeout(r, 100));
    const log = await as.get(`/api/admin/audit?agent=${a.agent._id}&event=tool_call`);
    expect(log.body.map((e: { tool: string; outcome: string; agentName: string }) => [e.tool, e.outcome, e.agentName]))
      .toEqual([["get_post", "404", "Claude"], ["list_posts", "ok", "Claude"]]);
    const metrics = await registry.metrics();
    expect(metrics).toMatch(/agent_tool_calls_total\{tool="list_posts",outcome="ok"\} [1-9]/);
    expect(metrics).toMatch(/agent_tool_errors_total\{tool="get_post"\} [1-9]/);
    expect(metrics).toMatch(/change_requests_active\{status="open"\} 0/);
  });
});
