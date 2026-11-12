import request from "supertest";
import app from "../app";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createComment } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

describe("comments", () => {
  test("list shows published comments with the author's name only", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser(UserRole.USER, "reader");
    const post = await createPost(admin._id);
    await createComment(post._id, user._id, "hello");
    const res = await request(app).get(`/api/comments/${post._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].author).toEqual({ _id: String(user._id), name: "reader" });
  });

  test("comments of a draft are hidden, and drafts take no comments", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    const draft = await createPost(admin._id, { published: false });
    expect((await request(app).get(`/api/comments/${draft._id}`)).status).toBe(404);
    const res = await request(app).post(`/api/comments/${draft._id}`).set("Cookie", cookieFor(user)).send({ content: "hi" });
    expect(res.status).toBe(404);
  });

  test("posting needs a session; empty content is a 400", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    const post = await createPost(admin._id);
    expect((await request(app).post(`/api/comments/${post._id}`).send({ content: "hi" })).status).toBe(401);
    const empty = await request(app).post(`/api/comments/${post._id}`).set("Cookie", cookieFor(user)).send({ content: "  " });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/comment/i);
    const ok = await request(app).post(`/api/comments/${post._id}`).set("Cookie", cookieFor(user)).send({ content: "<b>hi</b> there" });
    expect(ok.status).toBe(201);
    expect(ok.body.content).toBe("hi there");
  });

  test("only the author (or the admin) can edit or delete a comment", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const author = await createUser();
    const other = await createUser();
    const post = await createPost(admin._id);
    const comment = await createComment(post._id, author._id);
    const url = `/api/comments/${post._id}/${comment._id}`;
    expect((await request(app).patch(url).set("Cookie", cookieFor(other)).send({ content: "x" })).status).toBe(403);
    expect((await request(app).delete(url).set("Cookie", cookieFor(other))).status).toBe(403);
    const edited = await request(app).patch(url).set("Cookie", cookieFor(author)).send({ content: "edited" });
    expect(edited.status).toBe(200);
    expect(edited.body.content).toBe("edited");
    expect((await request(app).delete(url).set("Cookie", cookieFor(admin))).status).toBe(204);
    expect((await request(app).get(`/api/comments/${post._id}`)).body).toHaveLength(0);
  });

  test("a comment id under the wrong post is a 404", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const p1 = await createPost(admin._id);
    const p2 = await createPost(admin._id);
    const comment = await createComment(p1._id, admin._id);
    expect((await request(app).delete(`/api/comments/${p2._id}/${comment._id}`).set("Cookie", cookieFor(admin))).status).toBe(404);
  });
});
