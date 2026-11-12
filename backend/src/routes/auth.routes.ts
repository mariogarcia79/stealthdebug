import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import AuthController from "../controllers/auth.controller";
import { authenticate, checkRole } from "../middleware/auth.middleware";
import { rateLimitAuth } from "../middleware/rateLimit.middleware";

const router = Router();

// 10 attempts per 15 minutes per IP
const loginRateLimit = rateLimitAuth(15 * 60 * 1000, 10);
// 5 registrations per hour per IP
const signupRateLimit = rateLimitAuth(60 * 60 * 1000, 5);

router.post("/signup",  signupRateLimit, asyncHandler(AuthController.signUp));
router.post("/login",   loginRateLimit,  asyncHandler(AuthController.logIn));
router.post("/logout",  asyncHandler(AuthController.logout));

router.post("/signup-admin", authenticate, checkRole("admin"), asyncHandler(AuthController.signUpAdmin));

router.get("/user", authenticate, asyncHandler(AuthController.getUserInfo));

export default router;