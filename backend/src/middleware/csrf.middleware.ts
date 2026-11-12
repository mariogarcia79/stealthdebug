import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { sendError } from "../config/errors";
import { env } from "../config/env";

// CSRF synchronizer token for the admin API (on top of the SameSite=Strict
// session cookie): GET /api/admin/csrf hands it to the page, which sends it
// back in the X-CSRF-Token header on every change. It is bound to the admin
// and to this session (the cookie), so it dies with the session.
export function csrfTokenFor(req: Request): string {
  const session = createHash("sha256").update(String(req.cookies?.jwt ?? "")).digest("hex");
  return createHmac("sha256", `admin-csrf:${env.jwtSecret}`).update(`${req.user?._id}|${session}`).digest("base64url");
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const given = Buffer.from(String(req.headers["x-csrf-token"] ?? ""));
  const expected = Buffer.from(csrfTokenFor(req));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return sendError(res, "FORBIDDEN", "Invalid CSRF token");
  }
  next();
}
