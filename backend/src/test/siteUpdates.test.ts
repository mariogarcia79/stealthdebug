import request from "supertest";
import app from "../app";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, createPost } from "./helpers";
import PostModel from "../models/Post";
import PageService from "../services/pages.service";
import { setIndexTemplateForTests, injectMeta } from "../controllers/postPage.controller";
import { snapshot, changedUrls } from "../services/siteUpdates.service";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

const SITE = "https://stealthdebug.org";

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <script src="/theme-init.js"></script>
    <!-- page-meta -->
    <title>stealthdebug</title>
    <meta name="description" content="default" />
    <!-- /page-meta -->
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;
setIndexTemplateForTests(TEMPLATE);

describe("public documents follow the database at once", () => {
  test("publishing, editing and unpublishing show up in the sitemap, feed and llms.txt", async () => {
    const admin = await createUser(UserRole.ADMIN, "Mario");
    const draft = await createPost(admin._id, { title: "Coming soon", published: false });

    // built once (cached), then a write must drop the copy
    for (const url of ["/api/sitemap.xml", "/api/feed.xml", "/api/llms.txt"]) {
      expect((await request(app).get(url)).text).not.toContain(String(draft._id));
    }

    await PostModel.updateOne({ _id: draft._id }, { published: true });
    expect((await request(app).get("/api/sitemap.xml")).text).toContain(`${SITE}/blog/${draft._id}`);
    expect((await request(app).get("/api/feed.xml")).text).toContain("<title>Coming soon</title>");
    expect((await request(app).get("/api/llms.txt")).text).toContain("Coming soon");

    await PostModel.findByIdAndUpdate(draft._id, { title: "Out now" });
    expect((await request(app).get("/api/feed.xml")).text).toContain("<title>Out now</title>");

    await PostModel.updateMany({ _id: draft._id }, { published: false });
    expect((await request(app).get("/api/feed.xml")).text).not.toContain("Out now");
    expect((await request(app).get("/api/sitemap.xml")).text).not.toContain(String(draft._id));
  });

  test("revalidation: no-cache, Last-Modified and ETag; 304 until something changes", async () => {
    const admin = await createUser(UserRole.ADMIN);
    await createPost(admin._id, { title: "First" });
    const first = await request(app).get("/api/sitemap.xml");
    expect(first.headers["cache-control"]).toBe("public, no-cache");
    expect(first.headers["last-modified"]).toBeTruthy();
    expect(first.headers.etag).toBeTruthy();

    const again = await request(app).get("/api/sitemap.xml")
      .set("If-None-Match", first.headers.etag).set("If-Modified-Since", first.headers["last-modified"]);
    expect(again.status).toBe(304);

    await createPost(admin._id, { title: "Second" });
    const after = await request(app).get("/api/sitemap.xml")
      .set("If-Modified-Since", first.headers["last-modified"]);
    expect(after.status).toBe(200);
    expect(new Date(after.headers["last-modified"]) > new Date(first.headers["last-modified"])).toBe(true);
  });
});

describe("RSS feed", () => {
  test("newest published originals, escaped; ?lang= picks translations", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const post = await createPost(admin._id, { title: "Dumping <SPI> & co", summary: "Flash", tags: ["hw"], lang: "en" });
    await createPost(admin._id, { title: "Hidden draft", published: false });
    await PostModel.create({ author: admin._id, title: "Volcando SPI", summary: "Flash es", content: "x", published: true, lang: "es", translationOf: post._id });

    const r = await request(app).get("/api/feed.xml");
    expect(r.headers["content-type"]).toMatch(/^application\/rss\+xml/);
    expect(r.text).toContain("<title>Dumping &lt;SPI&gt; &amp; co</title>");
    expect(r.text).toContain(`<link>${SITE}/blog/${post._id}</link>`);
    expect(r.text).toContain("<category>hw</category>");
    expect(r.text).not.toContain("Hidden draft");
    expect(r.text).not.toContain("Volcando");

    const es = await request(app).get("/api/feed.xml?lang=es");
    expect(es.text).toContain("<title>Volcando SPI</title>");
    expect(es.text).toContain(`<link>${SITE}/blog/${post._id}?lang=es</link>`);
    expect(es.text).toContain("<language>es</language>");
  });
});

describe("post pages with meta tags", () => {
  test("a published post: title, description, canonical, hreflang, OG, JSON-LD", async () => {
    const admin = await createUser(UserRole.ADMIN, "Mario");
    const post = await createPost(admin._id, {
      title: 'Glitching "the" <boot>', summary: "Voltage & timing", tags: ["fault"], lang: "en",
      content: "Intro ![chip](/api/uploads/chip.webp)",
    });
    await PostModel.create({ author: admin._id, title: "Glitch", summary: "Voltaje", content: "x", published: true, lang: "es", translationOf: post._id });

    const r = await request(app).get(`/api/html/blog/${post._id}`);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/html/);
    const h = r.text;
    expect(h).toContain("<title>Glitching &quot;the&quot; &lt;boot&gt; · stealthdebug</title>");
    expect(h).not.toContain('content="default"');
    expect(h).toContain('<meta name="description" content="Voltage &amp; timing" />');
    expect(h).toContain(`<link rel="canonical" href="${SITE}/blog/${post._id}" />`);
    expect(h).toContain(`<link rel="alternate" hreflang="es" href="${SITE}/blog/${post._id}?lang=es" />`);
    expect(h).toContain(`<meta property="og:image" content="${SITE}/api/uploads/chip.webp" />`);
    expect(h).toContain('<meta property="article:tag" content="fault" />');
    expect(h).toContain('"@type":"BlogPosting"');
    expect(h).toContain('\\u003cboot\\u003e');     // nothing can close the JSON-LD <script>
    expect(h).toContain('<script type="module" src="/assets/index-abc.js"></script>');

    const es = await request(app).get(`/api/html/blog/${post._id}?lang=es`);
    expect(es.text).toContain('<html lang="es">');
    expect(es.text).toContain("<title>Glitch · stealthdebug</title>");
    expect(es.text).toContain(`<link rel="canonical" href="${SITE}/blog/${post._id}?lang=es" />`);
  });

  test("drafts and unknown ids get index.html untouched; edits show at once", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const draft = await createPost(admin._id, { title: "Secret", published: false });
    for (const id of [String(draft._id), "0123456789abcdef01234567", "nope"]) {
      const r = await request(app).get(`/api/html/blog/${id}`);
      expect(r.status).toBe(200);
      expect(r.text).toBe(TEMPLATE);
    }
    await PostModel.updateOne({ _id: draft._id }, { published: true });
    expect((await request(app).get(`/api/html/blog/${draft._id}`)).text).toContain("<title>Secret · stealthdebug</title>");
    await PostModel.updateOne({ _id: draft._id }, { title: "Renamed" });
    expect((await request(app).get(`/api/html/blog/${draft._id}`)).text).toContain("<title>Renamed · stealthdebug</title>");
  });

  test("without markers, the <title> is replaced", () => {
    const out = injectMeta('<html lang="en"><head><title>x</title></head></html>', { lang: "es", head: "<title>T</title>" });
    expect(out).toBe('<html lang="es"><head><!-- page-meta -->\n<title>T</title>\n    <!-- /page-meta --></head></html>');
  });
});

describe("IndexNow: which URLs changed", () => {
  test("added, edited and removed public URLs, plus the lists; drafts never", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const a = await createPost(admin._id, { title: "A" });
    const b = await createPost(admin._id, { title: "B" });
    const draft = await createPost(admin._id, { title: "D", published: false });
    const before = await snapshot();

    await new Promise((r) => setTimeout(r, 5));   // a distinct updatedAt
    await PostModel.updateOne({ _id: a._id }, { title: "A2" });
    await PostModel.updateOne({ _id: b._id }, { published: false });
    await PostModel.updateOne({ _id: draft._id }, { title: "D2" });
    await PostModel.create({ author: admin._id, title: "A es", summary: "s", content: "c", published: true, lang: "es", translationOf: a._id });
    const after = await snapshot();

    expect(changedUrls(before, after).sort()).toEqual([
      `${SITE}/`, `${SITE}/blog`,
      `${SITE}/blog/${a._id}`, `${SITE}/blog/${a._id}?lang=es`, `${SITE}/blog/${b._id}`,
    ].sort());
    expect(changedUrls(after, after)).toEqual([]);
  });

  test("the about page counts once it has content", async () => {
    const before = await snapshot();
    await PageService.save("about", "Hi");
    expect(changedUrls(before, await snapshot())).toEqual([`${SITE}/about`]);
  });

  test("the key file is 404 while INDEXNOW_KEY is unset", async () => {
    expect((await request(app).get("/api/indexnow.txt")).status).toBe(404);
  });
});
