import express from "express";
import request from "supertest";
import { asyncHandler, errorHandler, notFoundHandler } from "../middleware/error.middleware";
import { AppError, ValidationError } from "../config/errors";

// A tiny app with routes that fail in each way the real handlers can.
const app = express();
app.use(express.json());
app.get("/validation", asyncHandler(async () => { throw new ValidationError("Title is required"); }));
app.get("/known", asyncHandler(async () => { throw new AppError("POST_IS_PUBLISHED"); }));
app.get("/details", asyncHandler(async () => { throw new AppError("BAD_REQUEST", "In use", { usedIn: [1] }); }));
app.get("/crash", asyncHandler(async () => { throw new Error("E11000 duplicate key error collection: secret.users index"); }));
app.get("/sync-crash", () => { throw new TypeError("cannot read x of undefined"); });
app.post("/json", (req, res) => { res.json(req.body); });
app.use(notFoundHandler);
app.use(errorHandler);

describe("error middleware", () => {
  beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  test("validation errors: 400 with their message", async () => {
    expect(await request(app).get("/validation")).toMatchObject({ status: 400, body: { error: "Title is required" } });
  });

  test("known errors keep their status and message, plus details", async () => {
    expect(await request(app).get("/known")).toMatchObject({ status: 409, body: { error: "Unpublish the post before deleting it" } });
    expect((await request(app).get("/details")).body).toEqual({ error: "In use", usedIn: [1] });
  });

  test("unexpected errors: generic 500, internals never reach the client", async () => {
    for (const path of ["/crash", "/sync-crash"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Unknown error" });
    }
    expect(console.error).toHaveBeenCalled();   // but they are logged
  });

  test("bad JSON: 400 JSON; unknown route: 404 JSON", async () => {
    const bad = await request(app).post("/json").set("Content-Type", "application/json").send("{nope");
    expect(bad).toMatchObject({ status: 400, body: { error: "Request body is not valid JSON" } });
    expect(await request(app).get("/missing")).toMatchObject({ status: 404, body: { error: "Not found" } });
  });
});
