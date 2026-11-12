import { Router } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { authenticate, checkRole, optionalAuth } from "../middleware/auth.middleware";
import PostController from "../controllers/posts.controller";

const router = Router();

router.get(   "/",            optionalAuth, asyncHandler(PostController.getAllPosts));
router.get(   "/:id",         optionalAuth, asyncHandler(PostController.getPostById));
router.post(  "/",            authenticate, checkRole("admin"), asyncHandler(PostController.createPost));
router.patch( "/:id",         authenticate, checkRole("admin"), asyncHandler(PostController.patchPostById));
router.delete("/:id",         authenticate, checkRole("admin"), asyncHandler(PostController.deletePostById));

export default router;
