import request from "supertest";
import app from "../app";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

describe("about page and sitemap", () => {
  test("empty until saved; only the admin saves; listed in the sitemap once it has content", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    expect((await request(app).get("/api/pages/about")).body).toEqual(expect.objectContaining({ content: "", updatedAt: null }));
    expect((await request(app).put("/api/pages/about").set("Cookie", cookieFor(user)).send({ content: "x" })).status).toBe(403);
    expect((await request(app).put("/api/pages/about").set("Cookie", cookieFor(admin)).send({ content: 5 })).status).toBe(400);
    expect((await request(app).get("/api/pages/contact")).status).toBe(404);
    expect((await request(app).get("/api/sitemap.xml")).text).not.toContain("/about<");
    expect((await request(app).put("/api/pages/about").set("Cookie", cookieFor(admin)).send({ content: "## CV" })).status).toBe(200);
    expect((await request(app).get("/api/pages/about")).body.content).toBe("## CV");
    expect((await request(app).get("/api/sitemap.xml")).text).toContain("/about<");
  });

  test("the sitemap lists published posts only", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const live = await createPost(admin._id);
    const draft = await createPost(admin._id, { published: false });
    const xml = (await request(app).get("/api/sitemap.xml")).text;
    expect(xml).toContain(`/blog/${live._id}<`);
    expect(xml).not.toContain(String(draft._id));
  });
});
