import request from "supertest";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import app from "../app";
import MediaModel from "../models/Media";
import PendingImageModel from "../models/PendingImage";
import PostModel from "../models/Post";
import ChangeRequestService from "../services/changeRequests.service";
import AgentImageService from "../services/agentImages.service";
import MediaService, { UPLOAD_DIR, VARIANT_DIR } from "../services/media.service";
import { isPublicAddress, checkImageUrl, fetchImage } from "../utils/safeFetch";
import { cleanBuffer, metadataFound } from "../scripts/stripMetadata";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createAgent, agentAuth } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Secret Person"/></rdf:RDF></x:xmpmeta>';

// A JPEG full of metadata: author, GPS position, XMP, and a 90° orientation
async function dirtyJpeg(w = 300, h = 200): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#c00" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "Secret Person" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 25/1 0/1" } })
    .withXmp(XMP)
    .toBuffer();
}

describe("metadata", () => {
  test("admin uploads are stored without any metadata, oriented", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const res = await request(app).post("/api/media").set("Cookie", cookieFor(admin)).attach("file", await dirtyJpeg(), "photo.jpg");
    expect(res.status).toBe(201);
    const file = await fs.readFile(path.join(UPLOAD_DIR, res.body.filename));
    const m = await sharp(file).metadata();
    expect(metadataFound(m)).toEqual([]);
    expect(file.includes("Secret Person")).toBe(false);
    expect([m.width, m.height]).toEqual([200, 300]);   // orientation 6 applied
    for (const v of res.body.variants) {
      const vf = await fs.readFile(path.join(VARIANT_DIR, path.basename(v.url)));
      expect(vf.includes("Secret Person")).toBe(false);
    }
  });

  test("cleanup script: same format, no metadata, orientation applied", async () => {
    const dirty = await dirtyJpeg();
    expect(metadataFound(await sharp(dirty).metadata())).toEqual(expect.arrayContaining(["EXIF", "XMP", "orientation 6"]));
    const clean = await cleanBuffer(dirty, "jpeg");
    const m = await sharp(clean).metadata();
    expect(m.format).toBe("jpeg");
    expect(metadataFound(m)).toEqual([]);
    expect([m.width, m.height]).toEqual([200, 300]);
    expect(clean.includes("Secret Person")).toBe(false);
  });
});

describe("safe image download", () => {
  test("only public addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1"]) {
      expect([a, isPublicAddress(a)]).toEqual([a, false]);
    }
    for (const a of ["1.1.1.1", "160.79.104.10", "2606:4700:4700::1111"]) expect(isPublicAddress(a)).toBe(true);
  });

  test("URL rules", async () => {
    expect(() => checkImageUrl("http://example.com/a.png")).toThrow(/https/);
    expect(() => checkImageUrl("https://user:pw@example.com/a.png")).toThrow(/credentials/);
    expect(() => checkImageUrl("https://example.com:8443/a.png")).toThrow(/port/);
    expect(() => checkImageUrl("https://127.0.0.1/a.png")).toThrow(/not allowed/);
    expect(() => checkImageUrl("https://[::1]/a.png")).toThrow(/not allowed/);
    // a name resolving to a private address is refused when connecting
    await expect(fetchImage("https://localhost/a.png", { maxBytes: 1000, timeoutMs: 3000 })).rejects.toThrow(/not allowed/);
  });
});

describe("agent images", () => {
  async function setup() {
    const admin = await createUser(UserRole.ADMIN, "Mario");
    const a = await createAgent(admin._id, "Claude");
    const auth = agentAuth(a);
    const upload = (body: object) => request(app).post("/api/agent/images").set("Authorization", auth).send(body);
    const propose = (body: object) => request(app).post("/api/agent/change-requests").set("Authorization", auth).send(body);
    return { admin, a, upload, propose, auth };
  }

  test("upload: cleaned, private until accepted, then in the library under the same name", async () => {
    const { admin, a, upload, propose } = await setup();
    const res = await upload({ data: (await dirtyJpeg()).toString("base64"), filename: "board.jpg", alt: "The board" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ alt: "The board", width: 200, height: 300 });
    expect(res.body.url).toMatch(/^\/api\/uploads\/board-\d+-[A-Za-z0-9]{6}\.webp$/);
    expect(res.body.markdown).toBe(`![The board](${res.body.url})`);
    const { filename } = res.body;

    // not public: no file in the uploads directory, no library entry
    await expect(fs.access(path.join(UPLOAD_DIR, filename))).rejects.toThrow();
    expect(await MediaModel.exists({ filename })).toBeNull();
    const stored = (await PendingImageModel.findOne({ filename }))!;
    expect(stored.data.includes("Secret Person")).toBe(false);
    expect(metadataFound(await sharp(stored.data).metadata())).toEqual([]);

    // the agent lists it
    const list = await request(app).get("/api/agent/images").set("Authorization", agentAuth(a));
    expect(list.body.map((i: { filename: string }) => i.filename)).toEqual([filename]);

    const cr = await propose({ kind: "new", fields: { title: "T", summary: "S", content: `Look:\n\n${res.body.markdown}` }, description: "d" });
    expect(cr.status).toBe(201);

    // the admin's review shows it, served only to admins
    const cookie = cookieFor(admin);
    const review = await request(app).get(`/api/admin/change-requests/${cr.body.id}`).set("Cookie", cookie);
    expect(review.body.images.pending).toEqual([expect.objectContaining({ filename, previewUrl: `/api/admin/pending-images/${filename}` })]);
    const img = await request(app).get(`/api/admin/pending-images/${filename}`).set("Cookie", cookie);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/webp");
    expect((await request(app).get(`/api/admin/pending-images/${filename}`)).status).toBe(401);

    await ChangeRequestService.accept(String(admin._id), cr.body.id, { revision: 1, publish: true });
    await fs.access(path.join(UPLOAD_DIR, filename));
    expect(await MediaModel.findOne({ filename }).lean()).toMatchObject({ alt: "The board", width: 200, height: 300 });
    expect(await PendingImageModel.exists({ filename })).toBeNull();
    const post = await PostModel.findOne({ title: "T" }).lean();
    expect(post?.content).toContain(`/api/uploads/${filename}`);
  });

  test("validation and limits", async () => {
    const { upload } = await setup();
    expect((await upload({})).status).toBe(400);
    expect((await upload({ data: "aGVsbG8=", url: "https://example.com/a.png" })).status).toBe(400);
    expect((await upload({ data: Buffer.from("not an image").toString("base64") })).status).toBe(400);
    expect((await upload({ data: "%%%" })).status).toBe(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    expect((await upload({ data: svg.toString("base64") })).status).toBe(400);
    expect((await upload({ url: "http://example.com/a.png" })).status).toBe(400);
  });

  test("another agent's or a missing image is not published by an accept", async () => {
    const { admin, upload } = await setup();
    const other = await createAgent(admin._id, "Other");
    const mine = await upload({ data: (await dirtyJpeg()).toString("base64") });
    const cr = await request(app).post("/api/agent/change-requests").set("Authorization", agentAuth(other))
      .send({ kind: "new", fields: { title: "T", summary: "S", content: `![x](${mine.body.url})` }, description: "d" });
    await ChangeRequestService.accept(String(admin._id), cr.body.id, { revision: 1 });
    expect(await MediaModel.exists({ filename: mine.body.filename })).toBeNull();
    expect(await PendingImageModel.exists({ filename: mine.body.filename })).not.toBeNull();
  });

  test("expired unused images are purged; ones an open request uses are kept", async () => {
    const { upload, propose } = await setup();
    const used = await upload({ data: (await dirtyJpeg()).toString("base64") });
    const unused = await upload({ data: (await dirtyJpeg()).toString("base64") });
    await propose({ kind: "new", fields: { title: "T", summary: "S", content: used.body.markdown }, description: "d" });
    const later = new Date(Date.now() + 31 * 86400_000);
    expect(await AgentImageService.purgeExpired(later)).toBe(1);
    expect(await PendingImageModel.exists({ filename: used.body.filename })).not.toBeNull();
    expect(await PendingImageModel.exists({ filename: unused.body.filename })).toBeNull();
  });
});

afterAll(async () => { await fs.rm(UPLOAD_DIR, { recursive: true, force: true }); void MediaService; });
