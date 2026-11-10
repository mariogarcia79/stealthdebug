import express, { Router } from "express";
import { UPLOAD_DIR } from "../services/media.service";
import { sendError } from "../config/errors";

// Read-only file serving for uploaded images and their resized copies.
//
// In production nginx serves /api/uploads/ directly from the volume, so this
// is only reached in local development (or if nginx is misconfigured).
// File names are unique per upload and never rewritten, so they can be cached
// for a year. Management (upload/delete) lives under /api/media.
const router = Router();

router.use(
  "/",
  express.static(UPLOAD_DIR, {
    immutable: true,
    maxAge: "365d",
    index: false,
    dotfiles: "ignore",
    redirect: false,
  })
);

// Anything not served above (missing file, directory, other method) ends
// here as a plain 404 instead of reaching other routes or Express's error log.
router.use((_req, res) => sendError(res, "NOT_FOUND"));

export default router;
