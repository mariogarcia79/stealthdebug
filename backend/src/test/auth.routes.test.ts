import request from "supertest";
import app from "../app";
import UserModel from "../models/User";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, PASSWORD } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

const signup = { name: "newbie", email: "newbie@example.test", password: "Good-Pass-123!", acceptTerms: true };

describe("auth", () => {
  test("sign-up requires accepting the terms and stores the acceptance", async () => {
    expect((await request(app).post("/api/auth/signup").send({ ...signup, acceptTerms: false })).status).toBe(400);
    const res = await request(app).post("/api/auth/signup").send(signup);
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({ name: "newbie", role: "user" }));
    expect(res.body.hash).toBeUndefined();
    const stored = await UserModel.findOne({ name: "newbie" });
    expect(stored?.termsVersion).toBeTruthy();
  });

  test("sign-up validation errors are 400s with the reason", async () => {
    const weak = await request(app).post("/api/auth/signup").send({ ...signup, password: "weakpassword" });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/uppercase/);
  });

  test("a duplicate account is refused without revealing internals", async () => {
    await request(app).post("/api/auth/signup").send(signup);
    const dup = await request(app).post("/api/auth/signup").send({ ...signup, email: "other@example.test" });
    expect([400, 409]).toContain(dup.status);
    expect(JSON.stringify(dup.body)).not.toMatch(/E11000|index|dup key/);
  });

  test("login sets an httpOnly strict cookie; bad credentials are a 401", async () => {
    const user = await createUser(UserRole.USER, "loginuser");
    const ok = await request(app).post("/api/auth/login").send({ name: "loginuser", password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.headers["set-cookie"][0]).toMatch(/jwt=.*HttpOnly.*SameSite=Strict/);
    expect(ok.body.user._id).toBe(String(user._id));
    const bad = await request(app).post("/api/auth/login").send({ name: "loginuser", password: "Wrong-Pass-1!" });
    expect(bad.status).toBe(401);
    const weird = await request(app).post("/api/auth/login").send({ name: "x", password: "" });
    expect(weird.status).toBe(401);
  });

  test("/auth/user returns the session's user; logout blocks the token", async () => {
    const user = await createUser();
    const c = cookieFor(user);
    expect((await request(app).get("/api/auth/user").set("Cookie", c)).body._id).toBe(String(user._id));
    await request(app).post("/api/auth/logout").set("Cookie", c);
    expect((await request(app).get("/api/auth/user").set("Cookie", c)).status).toBe(401);
  });

  test("only the admin can create admins", async () => {
    const user = await createUser();
    const res = await request(app).post("/api/auth/signup-admin").set("Cookie", cookieFor(user)).send(signup);
    expect(res.status).toBe(403);
  });

  test("unknown API routes are a JSON 404", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
