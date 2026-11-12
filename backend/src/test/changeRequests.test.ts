import request from "supertest";
import app from "../app";
import PostModel from "../models/Post";
import CommentModel from "../models/Comment";
import ChangeRequestModel from "../models/ChangeRequest";
import ChangeRequestService from "../services/changeRequests.service";
import AgentService from "../services/agents.service";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createAgent, agentAuth } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

async function setup() {
  const admin = await createUser(UserRole.ADMIN, "Mario");
  const a = await createAgent(admin._id, "Claude");
  const post = await createPost(admin._id, { title: "Original", content: "Old text", tags: ["uart"] });
  const propose = (body: object) => request(app).post("/api/agent/change-requests").set("Authorization", agentAuth(a)).send(body);
  const revise = (id: string, body: object) => request(app).post(`/api/agent/change-requests/${id}/revisions`).set("Authorization", agentAuth(a)).send(body);
  const get = (id: string) => request(app).get(`/api/agent/change-requests/${id}`).set("Authorization", agentAuth(a));
  return { admin, a, post, propose, revise, get, adminId: String(admin._id) };
}

describe("proposing", () => {
  test("validation: kind, fields per kind, sizes, description", async () => {
    const { post, propose } = await setup();
    const id = String(post._id);
    expect((await propose({ kind: "merge", postId: id, fields: {}, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "edit", postId: id, fields: {}, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "edit", postId: id, fields: { published: true }, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "edit", postId: id, fields: { author: "x" }, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "edit", postId: id, fields: { content: "x".repeat(20001) }, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "edit", postId: id, fields: { title: "New" } })).status).toBe(400);
    expect((await propose({ kind: "new", fields: { title: "Only a title" }, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "translation", postId: id, lang: "es", fields: { title: "t", summary: "s", content: "c", tags: ["x"] }, description: "d" })).status).toBe(400);
    const ok = await propose({ kind: "edit", postId: id, fields: { title: "<b>New</b> title" }, description: "Clearer title" });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ kind: "edit", status: "open", postId: id, revisions: [{ number: 1, fields: { title: "New title" } }] });
  });

  test("limit of open requests per agent", async () => {
    const { post, propose } = await setup();
    for (let i = 0; i < 3; i++) {
      expect((await propose({ kind: "edit", postId: String(post._id), fields: { title: `T${i}` }, description: "d" })).status).toBe(201);
    }
    const over = await propose({ kind: "edit", postId: String(post._id), fields: { title: "T4" }, description: "d" });
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/At most 3/);
  });

  test("translations: of an original, into another language, only once", async () => {
    const { admin, post, propose } = await setup();
    const fields = { title: "Original (es)", summary: "Resumen", content: "Texto" };
    expect((await propose({ kind: "translation", postId: String(post._id), lang: "en", fields, description: "d" })).status).toBe(400);
    expect((await propose({ kind: "translation", postId: String(post._id), fields, description: "d" })).status).toBe(400);
    const es = await createPost(admin._id, { lang: "es", translationOf: post._id });
    expect((await propose({ kind: "translation", postId: String(post._id), lang: "es", fields, description: "d" })).status).toBe(409);
    expect((await propose({ kind: "translation", postId: String(es._id), lang: "en", fields, description: "d" })).status).toBe(400);
  });

  test("hidden posts can't be targeted", async () => {
    const { admin, propose } = await setup();
    const hidden = await createPost(admin._id, { mcpVisible: false });
    expect((await propose({ kind: "edit", postId: String(hidden._id), fields: { title: "x" }, description: "d" })).status).toBe(404);
  });

  test("an agent sees only its own requests", async () => {
    const { admin, post, propose, get } = await setup();
    const other = await createAgent(admin._id, "Other");
    const mine = await propose({ kind: "edit", postId: String(post._id), fields: { title: "x" }, description: "d" });
    const theirs = await request(app).get(`/api/agent/change-requests/${mine.body.id}`).set("Authorization", agentAuth(other));
    expect(theirs.status).toBe(404);
    const theirList = await request(app).get("/api/agent/change-requests").set("Authorization", agentAuth(other));
    expect(theirList.body).toEqual([]);
    const theirRevise = await request(app).post(`/api/agent/change-requests/${mine.body.id}/revisions`).set("Authorization", agentAuth(other))
      .send({ fields: { title: "hijack" }, description: "d" });
    expect(theirRevise.status).toBe(404);
    expect((await get(mine.body.id)).status).toBe(200);
  });
});

describe("review", () => {
  test("accept an edit: applied, and a system comment by the agent, in the post's language", async () => {
    const { adminId, post, propose } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { content: "New text", tags: [] }, description: "Fix" });
    await ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 });
    const updated = await PostModel.findById(post._id).lean();
    expect(updated).toMatchObject({ title: "Original", content: "New text", tags: [] });
    const comments = await request(app).get(`/api/comments/${post._id}`);
    expect(comments.body).toHaveLength(1);
    expect(comments.body[0].author.name).toBe("Claude");
    expect(comments.body[0].content).toMatch(/^Claude edited this post under the supervision of Mario on \d{4}-\d{2}-\d{2}\.$/);
    expect((await ChangeRequestModel.findById(cr.body.id))?.status).toBe("accepted");
  });

  test("Spanish post: the comment is in Spanish", async () => {
    const { admin, adminId, propose } = await setup();
    const es = await createPost(admin._id, { lang: "es" });
    const cr = await propose({ kind: "edit", postId: String(es._id), fields: { title: "Nuevo" }, description: "d" });
    await ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 });
    const c = await CommentModel.findOne({ post: es._id }).lean();
    expect(c?.content).toMatch(/^Claude editó este artículo bajo la supervisión de Mario el /);
  });

  test("outdated when the post changes; blocked until revised; reverting reopens", async () => {
    const { admin, adminId, post, propose, revise, get } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "Better" }, description: "d" });
    // the admin edits the post meanwhile
    await request(app).patch(`/api/posts/${post._id}`).set("Cookie", cookieFor(admin)).send({ content: "Admin changed it" });
    expect((await get(cr.body.id)).body.status).toBe("outdated");
    await expect(ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 })).rejects.toMatchObject({ status: 409, key: "CHANGE_REQUEST_OUTDATED" });
    // publishing doesn't count as a change
    await request(app).patch(`/api/posts/${post._id}`).set("Cookie", cookieFor(admin)).send({ content: "Old text", published: false });
    expect((await get(cr.body.id)).body.status).toBe("open");
    await request(app).patch(`/api/posts/${post._id}`).set("Cookie", cookieFor(admin)).send({ content: "Changed again" });
    const r2 = await revise(cr.body.id, { fields: { title: "Better" }, description: "rebased" });
    expect(r2.body).toMatchObject({ status: "open", revisions: [{ number: 1 }, { number: 2 }] });
    await ChangeRequestService.accept(adminId, cr.body.id, { revision: 2 });
    expect((await PostModel.findById(post._id))?.title).toBe("Better");
  });

  test("decline needs a comment; the agent reads it and revises; stale accept refused", async () => {
    const { adminId, post, propose, revise, get } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "Meh" }, description: "d" });
    await expect(ChangeRequestService.decline(adminId, cr.body.id, "  ")).rejects.toMatchObject({ status: 400 });
    await ChangeRequestService.decline(adminId, cr.body.id, "Keep the word UART in the title");
    const seen = await get(cr.body.id);
    expect(seen.body.status).toBe("declined");
    expect(seen.body.revisions[0].review).toMatchObject({ decision: "declined", by: "Mario", comment: "Keep the word UART in the title" });
    expect(JSON.stringify(seen.body)).not.toContain(adminId);   // names, not ids
    await expect(ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 })).rejects.toMatchObject({ status: 409 });

    await revise(cr.body.id, { fields: { title: "UART title" }, description: "as asked" });
    await expect(ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 })).rejects.toMatchObject({ key: "CHANGE_REQUEST_STALE_REVIEW" });
    await ChangeRequestService.accept(adminId, cr.body.id, { revision: 2 });
    expect((await PostModel.findById(post._id))?.title).toBe("UART title");
    // final: no more revisions, no second accept
    expect((await revise(cr.body.id, { fields: { title: "again" }, description: "d" })).status).toBe(409);
    await expect(ChangeRequestService.accept(adminId, cr.body.id, { revision: 2 })).rejects.toMatchObject({ status: 409 });
  });

  test("two accepts at once apply once", async () => {
    const { adminId, post, propose } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "Once" }, description: "d" });
    const results = await Promise.allSettled([1, 2, 3].map(() => ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await CommentModel.countDocuments({ post: post._id })).toBe(1);
  });

  test("accept a new post: authored by the agent, published or draft as chosen", async () => {
    const { adminId, propose } = await setup();
    const fields = { title: "By Claude", summary: "S", content: "C", tags: ["Firmware"] };
    const a = await propose({ kind: "new", fields, description: "d" });
    const b = await propose({ kind: "new", lang: "es", fields, description: "d" });
    const ra = await ChangeRequestService.accept(adminId, a.body.id, { revision: 1, publish: true });
    const rb = await ChangeRequestService.accept(adminId, b.body.id, { revision: 1, publish: false });
    const pa = await PostModel.findById(ra.resultPost).populate("author", "name").lean();
    const pb = await PostModel.findById(rb.resultPost).lean();
    expect(pa).toMatchObject({ published: true, lang: "en", tags: ["firmware"], author: { name: "Claude" } });
    expect(pb).toMatchObject({ published: false, lang: "es" });
    const list = await request(app).get("/api/posts");
    expect(list.body.map((p: { title: string }) => p.title)).toContain("By Claude");
  });

  test("accept a translation: linked post in that language, not listed on its own", async () => {
    const { adminId, post, propose } = await setup();
    const cr = await propose({ kind: "translation", postId: String(post._id), lang: "es", fields: { title: "Original (es)", summary: "Resumen", content: "Texto" }, description: "d" });
    const done = await ChangeRequestService.accept(adminId, cr.body.id, { revision: 1, publish: true });
    const es = await PostModel.findById(done.resultPost).lean();
    expect(es).toMatchObject({ lang: "es", translationOf: post._id, tags: ["uart"], published: true });
    const list = await request(app).get("/api/posts");
    expect(list.body.map((p: { title: string }) => p.title)).toEqual(["Original"]);
    const agentView = await request(app).get(`/api/agent/posts/${post._id}`).set("Authorization", agentAuth((await setupAgentOf(cr.body.id))));
    expect(agentView.body.translations).toEqual([{ id: String(es!._id), lang: "es", published: true }]);
  });

  test("deleting a draft post closes requests on it and removes its translations", async () => {
    const { admin, post, propose } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "x" }, description: "d" });
    const es = await createPost(admin._id, { lang: "es", translationOf: post._id });
    await PostModel.updateOne({ _id: post._id }, { published: false });
    expect((await request(app).delete(`/api/posts/${post._id}`).set("Cookie", cookieFor(admin))).status).toBe(204);
    expect(await PostModel.exists({ _id: es._id })).toBeNull();
    expect((await ChangeRequestModel.findById(cr.body.id))?.status).toBe("closed");
  });

  test("hiding a post from agents closes requests on it", async () => {
    const { admin, adminId, post, propose, get } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "x" }, description: "d" });
    await request(app).patch(`/api/posts/${post._id}`).set("Cookie", cookieFor(admin)).send({ mcpVisible: false });
    await expect(ChangeRequestService.accept(adminId, cr.body.id, { revision: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await get(cr.body.id)).body.status).toBe("closed");
  });

  test("removing the agent closes its open requests", async () => {
    const { a, adminId, post, propose } = await setup();
    const cr = await propose({ kind: "edit", postId: String(post._id), fields: { title: "x" }, description: "d" });
    await AgentService.remove(adminId, String(a.agent._id));
    expect((await ChangeRequestModel.findById(cr.body.id))?.status).toBe("closed");
  });
});

// The agent (and a live grant) of a change request, for agentAuth
async function setupAgentOf(crId: string) {
  const cr = await ChangeRequestModel.findById(crId).lean();
  const OAuthGrantModel = (await import("../models/OAuthGrant")).default;
  const grant = await OAuthGrantModel.findOne({ agent: cr!.agent, revokedAt: null }).lean();
  return { agent: { _id: cr!.agent }, grant: grant! };
}
