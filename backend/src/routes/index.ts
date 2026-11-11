import { Router }   from "express";
import authRoutes   from "./auth.routes";
import postsRoutes  from "./posts.routes";
import userRoutes   from "./users.routes";
import commentsRoutes from "./comments.routes";
import uploadsRoutes from "./uploads.routes";
import mediaRoutes from "./media.routes";
import SitemapController from "../controllers/sitemap.controller";
import { authenticate, checkRole } from "../middleware/auth.middleware";

const router = Router();

router.use( "/auth",    authRoutes);
router.use( "/posts",   postsRoutes);
router.use( "/users",   userRoutes);
router.use( "/comments",commentsRoutes);
router.use( "/uploads", uploadsRoutes);
router.use( "/media",   mediaRoutes);
router.get( "/sitemap.xml", SitemapController.getSitemap);

export default router;