import request from "supertest";
import app from "../app";
import CommentModel from "../models/Comment";
import UserModel from "../models/User";
import { UserRole } from "../types/userRole";
import { connectTestDb, clearTestDb, closeTestDb, createUser, cookieFor, createPost, createComment, PASSWORD } from "./helpers";

beforeAll(connectTestDb);
beforeEach(clearTestDb);
afterAll(closeTestDb);

describe("users", () => {
  test("the list is admin-only and never includes password hashes", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const user = await createUser();
    expect((await request(app).get("/api/users").set("Cookie", cookieFor(user))).status).toBe(403);
    const res = await request(app).get("/api/users").set("Cookie", cookieFor(admin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain("hash");
  });

  test("the list filters by ?name= and ?role=", async () => {
    const admin = await createUser(UserRole.ADMIN, "boss");
    await createUser(UserRole.USER, "alice");
    await createUser(UserRole.USER, "bob");
    const byName = await request(app).get("/api/users?name=ali").set("Cookie", cookieFor(admin));
    expect(byName.body.map((u: any) => u.name)).toEqual(["alice"]);
    const byRole = await request(app).get("/api/users?role=admin").set("Cookie", cookieFor(admin));
    expect(byRole.body.map((u: any) => u.name)).toEqual(["boss"]);
    expect((await request(app).get("/api/users?role=root").set("Cookie", cookieFor(admin))).status).toBe(400);
  });

  test("a user can read and edit only their own profile", async () => {
    const me = await createUser();
    const other = await createUser();
    expect((await request(app).get(`/api/users/${other._id}`).set("Cookie", cookieFor(me))).status).toBe(403);
    const patched = await request(app).patch(`/api/users/${me._id}`).set("Cookie", cookieFor(me)).send({ name: "newname", role: "admin" });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("newname");
    expect(patched.body.role).toBe("user");   // role can't be changed this way
  });

  test("invalid profile input is a 400", async () => {
    const me = await createUser();
    const res = await request(app).patch(`/api/users/${me._id}`).set("Cookie", cookieFor(me)).send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  test("deleting an account deletes its comments too", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const me = await createUser();
    const post = await createPost(admin._id);
    await createComment(post._id, me._id);
    expect((await request(app).delete(`/api/users/${me._id}`).set("Cookie", cookieFor(me))).status).toBe(204);
    expect(await UserModel.exists({ _id: me._id })).toBeNull();
    expect(await CommentModel.countDocuments({ author: me._id })).toBe(0);
  });

  test("password change: wrong current password is a 401, weak new one a 400", async () => {
    const me = await createUser();
    const url = `/api/users/pwd/${me._id}`;
    const c = cookieFor(me);
    expect((await request(app).patch(url).set("Cookie", c).send({ currentPassword: "nope", newPassword: "Another-Pass-456!" })).status).toBe(401);
    expect((await request(app).patch(url).set("Cookie", c).send({ currentPassword: PASSWORD, newPassword: "weak" })).status).toBe(400);
    expect((await request(app).patch(url).set("Cookie", c).send({ currentPassword: PASSWORD, newPassword: "Another-Pass-456!" })).status).toBe(200);
  });

  test("an unknown user id is a 404 for the admin", async () => {
    const admin = await createUser(UserRole.ADMIN);
    expect((await request(app).get("/api/users/0123456789abcdef01234567").set("Cookie", cookieFor(admin))).status).toBe(404);
  });
});
