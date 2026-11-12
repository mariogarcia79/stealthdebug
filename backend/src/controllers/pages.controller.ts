import { Request, Response } from "express";
import PageService, { isPageSlug } from "../services/pages.service";
import MediaService from "../services/media.service";
import { AppError, ValidationError } from "../config/errors";
import { MAX_CONTENT_LENGTH } from "../config/validation";

// Unknown slugs are a 404, so the admin can't create arbitrary pages by
// mistyping a URL.
function slugOf(req: Request) {
  const { slug } = req.params;
  if (!isPageSlug(slug)) throw new AppError("NOT_FOUND");
  return slug;
}

class PageController {
  // GET /api/pages/:slug (public). Never saved yet = empty content.
  static async getPage(req: Request, res: Response): Promise<Response> {
    const slug = slugOf(req);
    const page = await PageService.get(slug);
    // Size data for responsive images, as for posts; never fails the page.
    let images = {};
    try {
      images = await MediaService.imagesForContent(page.content);
    } catch (err) {
      console.error("imagesForContent failed:", err);
    }
    return res.json({ slug, ...page, images });
  }

  // PUT /api/pages/:slug (admin) { content }. Empty content is allowed: the
  // page then shows as empty again.
  static async putPage(req: Request, res: Response): Promise<Response> {
    const slug = slugOf(req);
    const content = req.body?.content;
    if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`Content must be a string of at most ${MAX_CONTENT_LENGTH} characters`);
    }
    return res.json({ slug, ...(await PageService.save(slug, content)) });
  }
}

export default PageController;
