import request from "supertest";
import app from "../app";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, createPost, createAgent } from "./helpers";
import PostModel from "../models/Post";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

const SITE = "https://stealthdebug.org";

async function setup() {
  const admin = await createUser(UserRole.ADMIN, "Mario");
  const a = await createAgent(admin._id, "Claude");
  const post = await createPost(admin._id, { title: "Hello\nworld", summary: "About [things]", content: "Text ![img](/api/uploads/a.png) [next](/blog/x)", tags: ["hw"], lang: "en" });
  const draft = await createPost(admin._id, { title: "Secret draft", published: false });
  const es = await PostModel.create({ author: a.agent._id, supervisor: admin._id, title: "Hola", summary: "Sobre", content: "Texto", published: true, lang: "es", translationOf: post._id });
  const esDraft = await createPost(admin._id, { title: "Borrador", published: false });
  return { admin, a, post, draft, es, esDraft };
}

describe("llms.txt, Markdown posts and the sitemap", () => {
  test("llms.txt lists published originals once, with links to the Markdown versions", async () => {
    const { post, draft } = await setup();
    const r = await request(app).get("/api/llms.txt");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/plain/);
    expect(r.text).toMatch(/^# stealthdebug\n\n> /);
    expect(r.text).toContain(`- [Hello world](${SITE}/blog/${post._id}.md): About [things] (en, `);
    expect(r.text).toContain(`[Spanish](${SITE}/blog/${post._id}.es.md)`);
    expect(r.text).not.toContain("Hola");
    expect(r.text).not.toContain("Secret draft");
    expect(r.text).not.toContain(String(draft._id));
  });

  test("a post as Markdown: metadata, absolute links; the translation with its banner", async () => {
    const { post } = await setup();
    const en = await request(app).get(`/api/md/${post._id}.md`);
    expect(en.headers["content-type"]).toMatch(/^text\/markdown/);
    expect(en.headers["x-robots-tag"]).toBe("noindex");
    expect(en.text).toMatch(/^# Hello world\n\n> About \[things\]\n\n- Author: Mario\n/);
    expect(en.text).toContain("- Tags: hw");
    expect(en.text).toContain(`![img](${SITE}/api/uploads/a.png) [next](${SITE}/blog/x)`);
    expect(en.text).toContain(`- Also available in: [Spanish](${SITE}/blog/${post._id}.es.md)`);
    expect(en.text).not.toContain("supervision");

    const es = await request(app).get(`/api/md/${post._id}.es.md`);
    expect(es.headers["content-language"]).toBe("es");
    expect(es.text).toMatch(/^# Hola\n/);
    expect(es.text).toContain("- Autor: Mario");
    expect(es.text).toContain("*Claude tradujo este artículo del inglés con el consentimiento de Mario.*");
    expect(es.text).toContain(`[Original (inglés)](${SITE}/blog/${post._id}.md)`);
    expect((await request(app).get(`/api/md/${post._id}.en.md`)).text).toMatch(/^# Hello world/);
  });

  test("drafts, translations by their own id and bad names are 404", async () => {
    const { draft, es, post } = await setup();
    for (const f of [`${draft._id}.md`, `${es._id}.md`, `${post._id}.fr.md`, `${post._id}.txt`, "../etc.md", `${post._id}.de.md`]) {
      expect((await request(app).get(`/api/md/${encodeURIComponent(f)}`)).status).toBe(404);
    }
    await PostModel.updateOne({ _id: es._id }, { published: false });
    expect((await request(app).get(`/api/md/${post._id}.es.md`)).status).toBe(404);
  });

  test("posts hidden from agents are hidden from AI tools too, translations included", async () => {
    const { post } = await setup();
    expect((await request(app).get(`/api/posts/${post._id}?lang=es`)).body.markdown).toBe(`/blog/${post._id}.es.md`);
    await PostModel.updateOne({ _id: post._id }, { mcpVisible: false });
    const txt = (await request(app).get("/api/llms.txt")).text;
    expect(txt).not.toContain(String(post._id));
    expect(txt).not.toContain("Hello");
    expect((await request(app).get(`/api/md/${post._id}.md`)).status).toBe(404);
    expect((await request(app).get(`/api/md/${post._id}.es.md`)).status).toBe(404);
    expect((await request(app).get(`/api/posts/${post._id}?lang=es`)).body.markdown).toBeNull();
    // still a normal public post on the site
    expect((await request(app).get(`/api/posts/${post._id}`)).status).toBe(200);
  });

  test("an agent's own post carries the 'wrote' banner", async () => {
    const { admin, a } = await setup();
    const p = await PostModel.create({ author: a.agent._id, supervisor: admin._id, title: "By Claude", summary: "S", content: "C", published: true, lang: "en" });
    expect((await request(app).get(`/api/md/${p._id}.md`)).text)
      .toContain("*Claude wrote this post based on the work of Mario and under the supervision of Mario.*");
  });

  test("sitemap lists originals with hreflang alternates, never translations on their own", async () => {
    const { post, es } = await setup();
    const r = await request(app).get("/api/sitemap.xml");
    expect(r.text).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(r.text).toContain(`<xhtml:link rel="alternate" hreflang="es" href="${SITE}/blog/${post._id}?lang=es"/>`);
    expect(r.text).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${SITE}/blog/${post._id}"/>`);
    expect(r.text).not.toContain(`/blog/${es._id}`);
  });
});
