import express, { Router, Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate } from "../middleware/auth.middleware";
import { rateLimitAuth } from "../middleware/rateLimit.middleware";
import { sendError } from "../config/errors";
import OAuthController from "../controllers/oauth.controller";

const router = Router();
const MIN15 = 15 * 60 * 1000;

// Only admins approve agents; other users get a clear message
function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return sendError(res, "FORBIDDEN", "Only an administrator can connect an agent");
  next();
}

// The token and revocation endpoints take form-urlencoded bodies (RFC 6749)
const form = express.urlencoded({ extended: false, limit: "10kb" });

router.get( "/authorize",              rateLimitAuth(MIN15, 30, "oauth-authorize"), asyncHandler(OAuthController.authorize));
router.get( "/requests/:id",           authenticate, adminOnly, asyncHandler(OAuthController.getRequest));
router.post("/requests/:id/decision",  rateLimitAuth(MIN15, 20, "oauth-consent"), authenticate, adminOnly, asyncHandler(OAuthController.decide));
router.post("/token",                  rateLimitAuth(MIN15, 60, "oauth-token"), form, asyncHandler(OAuthController.token));
router.post("/revoke",                 rateLimitAuth(MIN15, 30, "oauth-revoke"), form, asyncHandler(OAuthController.revoke));

export default router;
