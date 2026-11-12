import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate, checkRole } from "../middleware/auth.middleware";
import { upload } from "../middleware/uploads.middleware";
import MediaController from "../controllers/media.controller";

// Media library management (admin only). Files themselves are served
// read-only under /api/uploads/ (see uploads.routes.ts and nginx).
const router = Router();

router.use(authenticate, checkRole("admin"));

router.get(   "/",     asyncHandler(MediaController.list));
router.post(  "/",     upload, asyncHandler(MediaController.upload));
router.patch( "/:id",  asyncHandler(MediaController.update));
router.delete("/:id",  asyncHandler(MediaController.remove));

export default router;
