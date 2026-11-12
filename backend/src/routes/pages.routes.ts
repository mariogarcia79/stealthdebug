import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate, checkRole } from "../middleware/auth.middleware";
import PageController from "../controllers/pages.controller";

const router = Router();

router.get("/:slug", asyncHandler(PageController.getPage));
router.put("/:slug", authenticate, checkRole("admin"), asyncHandler(PageController.putPage));

export default router;
