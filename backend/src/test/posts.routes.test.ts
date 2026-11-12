import request from "supertest";
import app from "../app";
import CommentModel from "../models/Comment";
import PostModel from "../models/Post";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createComment } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

describe("posts: reading", () => {
  test("anonymous list shows only published posts, without content", async () => {
    const admin = await createUser(UserRole.ADMIN);
    await createPost(admin._id, { title: "public" });
    await createPost(admin._id, { title: "draft", published: false });
    const res = await request(app).get("/api/posts");
    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.title)).toEqual(["public"]);
    expect(res.body[0].content).toBeUndefined();
    expect(res.body[0].readingMinutes).toBeGreaterThan(0);
  });

  test("?drafts=1 lists drafts for the admin only", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    await createPost(admin._id, { title: "draft", published: false });
    const asAdmin = await request(app).get("/api/posts?drafts=1").set("Cookie", cookieFor(admin));
    const asUser = await request(app).get("/api/posts?drafts=1").set("Cookie", cookieFor(user));
    expect(asAdmin.body).toHaveLength(1);
    expect(asUser.body).toHaveLength(0);
  });

  test("a draft is a 404 for everyone but the admin", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    const draft = await createPost(admin._id, { published: false });
    expect((await request(app).get(`/api/posts/${draft._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/posts/${draft._id}`).set("Cookie", cookieFor(user))).status).toBe(404);
    const asAdmin = await request(app).get(`/api/posts/${draft._id}`).set("Cookie", cookieFor(admin));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.content).toContain("markdown");
  });

  test("invalid and unknown ids", async () => {
    expect((await request(app).get("/api/posts/not-an-id")).body).toEqual({ error: "Invalid post ID" });
    expect((await request(app).get("/api/posts/0123456789abcdef01234567")).status).toBe(404);
  });
});

describe("posts: writing (admin)", () => {
  const valid = { title: "New", summary: "Sum", content: "Body", published: false };

  test("only the admin can create", async () => {
    const user = await createUser();
    expect((await request(app).post("/api/posts").send(valid)).status).toBe(401);
    expect((await request(app).post("/api/posts").set("Cookie", cookieFor(user)).send(valid)).status).toBe(403);
  });

  test("create, patch, normalised tags", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const created = await request(app).post("/api/posts").set("Cookie", cookieFor(admin))
      .send({ ...valid, tags: ["#Firmware", "UART Debug"] });
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual(["firmware", "uart-debug"]);
    expect(created.body.published).toBe(false);
    const patched = await request(app).patch(`/api/posts/${created.body._id}`).set("Cookie", cookieFor(admin)).send({ title: "Renamed" });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Renamed");
  });

  test("invalid input is a 400 with a message about the field, never a 500", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const c = cookieFor(admin);
    const empty = await request(app).post("/api/posts").set("Cookie", c).send({ ...valid, title: "" });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/title/i);
    const long = await request(app).post("/api/posts").set("Cookie", c).send({ ...valid, summary: "x".repeat(5000) });
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/summary/i);
    const pub = await request(app).post("/api/posts").set("Cookie", c).send({ ...valid, published: "yes" });
    expect(pub.status).toBe(400);
    const post = await createPost(admin._id);
    const patch = await request(app).patch(`/api/posts/${post._id}`).set("Cookie", c).send({ content: "" });
    expect(patch.status).toBe(400);
  });

  test("malformed JSON is a JSON 400", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const res = await request(app).post("/api/posts").set("Cookie", cookieFor(admin))
      .set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("patching an unknown post is a 404", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const res = await request(app).patch("/api/posts/0123456789abcdef01234567").set("Cookie", cookieFor(admin)).send({ title: "x" });
    expect(res.status).toBe(404);
  });

  test("delete: only drafts, together with their comments", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const c = cookieFor(admin);
    const live = await createPost(admin._id);
    const draft = await createPost(admin._id, { published: false });
    await createComment(draft._id, admin._id);
    const refused = await request(app).delete(`/api/posts/${live._id}`).set("Cookie", c);
    expect(refused.status).toBe(409);
    expect((await request(app).delete(`/api/posts/${draft._id}`).set("Cookie", c)).status).toBe(204);
    expect(await PostModel.exists({ _id: draft._id })).toBeNull();
    expect(await CommentModel.countDocuments({ post: draft._id })).toBe(0);
    expect((await request(app).delete(`/api/posts/${draft._id}`).set("Cookie", c)).status).toBe(404);
  });
});
