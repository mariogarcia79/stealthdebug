import { Router } from "express";
import { authenticate, checkRole } from "../middleware/auth.middleware";
import PageController from "../controllers/pages.controller";

const router = Router();

router.get("/:slug", PageController.getPage);
router.put("/:slug", authenticate, checkRole("admin"), PageController.putPage);

export default router;
