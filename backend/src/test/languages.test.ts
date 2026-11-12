import request from "supertest";
import app from "../app";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createAgent, agentAuth } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

async function setup() {
  const admin = await createUser(UserRole.ADMIN, "Mario");
  const a = await createAgent(admin._id, "Claude");
  const original = await createPost(admin._id, { title: "Hello", content: "English", lang: "en", series: "S" });
  const propose = (body: object) => request(app).post("/api/agent/change-requests").set("Authorization", agentAuth(a)).send(body);
  const csrf = (await request(app).get("/api/admin/csrf").set("Cookie", cookieFor(admin))).body.csrf;
  const accept = (id: string, publish = true) => request(app).post(`/api/admin/change-requests/${id}/accept`)
    .set("Cookie", cookieFor(admin)).set("X-CSRF-Token", csrf).send({ revision: 1, publish });
  return { admin, a, original, propose, accept };
}

describe("translations and attribution on the public site", () => {
  test("a post is served in the reader's language, once, with the original's id and languages", async () => {
    const { original, propose, accept } = await setup();
    const cr = (await propose({ kind: "translation", postId: String(original._id), lang: "es", fields: { title: "Hola", summary: "Resumen", content: "Español" }, description: "d" })).body;
    const tr = (await accept(cr.id)).body.resultPost;

    const es = await request(app).get(`/api/posts/${original._id}?lang=es`);
    expect(es.body).toMatchObject({ _id: tr, title: "Hola", lang: "es", originalId: String(original._id), originalLang: "en",
      author: { name: "Claude", role: "agent" }, supervisor: { name: "Mario" }, originalAuthor: { name: "Mario" }, series: { name: "S", part: 1 } });
    expect(es.body.languages.map((l: { lang: string }) => l.lang)).toEqual(["en", "es"]);

    const en = await request(app).get(`/api/posts/${original._id}?lang=en`);
    expect(en.body).toMatchObject({ title: "Hello", author: { name: "Mario", role: "admin" }, supervisor: null, originalAuthor: null });
    // without ?lang (the editor): exactly the post asked for
    expect((await request(app).get(`/api/posts/${tr}`)).body.title).toBe("Hola");

    const list = await request(app).get("/api/posts?lang=es");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ _id: String(original._id), title: "Hola", author: { name: "Claude" } });
    expect((await request(app).get("/api/posts")).body[0]).toMatchObject({ title: "Hello", author: { name: "Mario" } });
  });

  test("draft translations stay hidden from readers", async () => {
    const { original, propose, accept } = await setup();
    const cr = (await propose({ kind: "translation", postId: String(original._id), lang: "es", fields: { title: "Hola", summary: "R", content: "E" }, description: "d" })).body;
    const tr = (await accept(cr.id, false)).body.resultPost;
    const es = await request(app).get(`/api/posts/${original._id}?lang=es`);
    expect(es.body.title).toBe("Hello");
    expect(es.body.languages).toHaveLength(1);
    expect((await request(app).get(`/api/posts/${tr}`)).status).toBe(404);
    expect((await request(app).get("/api/posts?lang=es")).body[0].title).toBe("Hello");
  });

  test("a new post by an agent names the agent as author and the admin who accepted it", async () => {
    const { propose, accept } = await setup();
    const cr = (await propose({ kind: "new", fields: { title: "By Claude", summary: "S", content: "C" }, description: "d" })).body;
    const id = (await accept(cr.id)).body.resultPost;
    expect((await request(app).get(`/api/posts/${id}`)).body).toMatchObject({ author: { name: "Claude", role: "agent" }, supervisor: { name: "Mario" } });
  });
});
