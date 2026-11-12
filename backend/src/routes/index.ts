import { Router }   from "express";
import authRoutes   from "./auth.routes";
import postsRoutes  from "./posts.routes";
import userRoutes   from "./users.routes";
import commentsRoutes from "./comments.routes";
import uploadsRoutes from "./uploads.routes";
import mediaRoutes from "./media.routes";
import pagesRoutes from "./pages.routes";
import agentApiRoutes from "./agentApi.routes";
import oauthRoutes from "./oauth.routes";
import SitemapController from "../controllers/sitemap.controller";
import { notFoundHandler } from "../middleware/error.middleware";

const router = Router();

router.use( "/auth",    authRoutes);
router.use( "/posts",   postsRoutes);
router.use( "/users",   userRoutes);
router.use( "/comments",commentsRoutes);
router.use( "/uploads", uploadsRoutes);
router.use( "/media",   mediaRoutes);
router.use( "/pages",   pagesRoutes);
router.use( "/agent",   agentApiRoutes);
router.use( "/oauth",   oauthRoutes);
router.get( "/sitemap.xml", SitemapController.getSitemap);

// Anything else under /api: JSON 404
router.use(notFoundHandler);

export default router;