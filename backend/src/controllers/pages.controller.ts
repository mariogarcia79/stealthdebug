import { Request, Response } from "express";
import PageModel from "../models/Page";
import MediaService from "../services/media.service";
import { sendError } from "../config/errors";
import { MAX_CONTENT_LENGTH } from "../config/validation";

// Pages that exist. Anything else is a 404, so the admin can't create
// arbitrary pages by mistyping a URL.
export const PAGE_SLUGS = ["about"] as const;
const isPageSlug = (s: string): s is (typeof PAGE_SLUGS)[number] =>
  (PAGE_SLUGS as readonly string[]).includes(s);

class PageController {
  // GET /api/pages/:slug (public). Never saved yet = empty content.
  static async getPage(req: Request, res: Response): Promise<Response> {
    const { slug } = req.params;
    if (!isPageSlug(slug)) return sendError(res, "NOT_FOUND");
    try {
      const page = await PageModel.findOne({ slug }).lean();
      const content = page?.content ?? "";
      // Size data for responsive images, as for posts; never fails the page.
      let images = {};
      try {
        images = await MediaService.imagesForContent(content);
      } catch (err) {
        console.error("imagesForContent failed:", err);
      }
      return res.json({ slug, content, updatedAt: page?.updatedAt ?? null, images });
    } catch (err) {
      console.error("Error: getPage:", err);
      return sendError(res, "UNKNOWN_ERROR");
    }
  }

  // PUT /api/pages/:slug (admin) { content }. Empty content is allowed: the
  // page then shows as empty again.
  static async putPage(req: Request, res: Response): Promise<Response> {
    const { slug } = req.params;
    if (!isPageSlug(slug)) return sendError(res, "NOT_FOUND");
    const content = req.body?.content;
    if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
      return sendError(res, "INVALID_INPUT", `Content must be a string of at most ${MAX_CONTENT_LENGTH} characters`);
    }
    try {
      const page = await PageModel.findOneAndUpdate(
        { slug },
        { $set: { content } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return res.json({ slug, content: page?.content ?? content, updatedAt: page?.updatedAt ?? null });
    } catch (err) {
      console.error("Error: putPage:", err);
      return sendError(res, "UNKNOWN_ERROR");
    }
  }
}

export default PageController;
