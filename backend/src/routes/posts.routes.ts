import { Router } from "express";
import { authenticate, checkRole, optionalAuth } from "../middleware/auth.middleware";
import PostController from "../controllers/posts.controller";

const router = Router();

router.get(   "/",            optionalAuth, PostController.getAllPosts);
router.get(   "/:id",         optionalAuth, PostController.getPostById);
router.post(  "/",            authenticate, checkRole("admin"), PostController.createPost);
router.patch( "/:id",         authenticate, checkRole("admin"), PostController.patchPostById);
router.delete("/:id",         authenticate, checkRole("admin"), PostController.deletePostById);

export default router;
