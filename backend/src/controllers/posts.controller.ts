import { Request, Response } from "express";
import { Types } from "mongoose";

import PostService from "../services/posts.service";
import MediaService from "../services/media.service";
import { IPost } from "../types/post";
import { readingMinutes, normalizeTags, normalizeSeries } from "../utils/postMeta";
import { extractUploadFilenames, uploadUrl } from "../utils/media";
import { validateInput, isObjectId } from "../utils/validation";
import { AppError, ValidationError } from "../config/errors";
import { MAX_TITLE_LENGTH, MAX_CONTENT_LENGTH, MAX_SUMMARY_LENGTH } from "../config/validation";

// Errors are thrown (AppError / ValidationError) and answered by the error
// middleware; routes wrap these handlers with asyncHandler.

function validPublished(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ValidationError("published must be true or false");
  return value;
}

// Validates and normalises the editable fields present in body. With
// required = true (create), title, summary and content must be there.
function validatePostFields(body: Record<string, unknown>, required: boolean): Partial<Pick<IPost, "title" | "summary" | "content" | "published" | "tags" | "series" | "mcpVisible">> {
  const out: ReturnType<typeof validatePostFields> = {};
  if (required || body.title !== undefined)   out.title   = validateInput(body.title,   false, MAX_TITLE_LENGTH,   "Title");
  if (required || body.summary !== undefined) out.summary = validateInput(body.summary, false, MAX_SUMMARY_LENGTH, "Summary");
  if (required || body.content !== undefined) out.content = validateInput(body.content, true,  MAX_CONTENT_LENGTH, "Content");
  if (body.published !== undefined) out.published = validPublished(body.published);
  if (body.mcpVisible !== undefined) {
    if (typeof body.mcpVisible !== "boolean") throw new ValidationError("mcpVisible must be true or false");
    out.mcpVisible = body.mcpVisible;
  }
  if (body.tags !== undefined)      out.tags   = normalizeTags(body.tags);
  if (body.series !== undefined)    out.series = normalizeSeries(body.series);
  return out;
}

class PostController {

  static async getAllPosts(req: Request, res: Response): Promise<Response> {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip  = (page - 1) * limit;

    // ?drafts=1 from the admin also lists unpublished posts
    const includeDrafts = req.query.drafts === "1" && req.user?.role === "admin";
    const posts = await PostService.getAllPosts({ sorted: true, limit, skip, includeDrafts });

    // The list needs metadata, not the full markdown: reading time and the
    // first image of each post (as a responsive thumbnail).
    const firstImage = posts.map((p) => extractUploadFilenames(p.content)[0]);
    let images: Awaited<ReturnType<typeof MediaService.imagesByFilename>> = {};
    try {
      images = await MediaService.imagesByFilename(firstImage.filter(Boolean) as string[]);
    } catch (err) {
      console.error("imagesByFilename failed:", err);
    }

    return res.json(posts.map((p, i) => {
      const { content, ...rest } = p.toJSON();
      const name = firstImage[i];
      return {
        ...rest,
        readingMinutes: readingMinutes(content),
        cover: name ? { url: uploadUrl(name), ...(images[name] ?? {}) } : null,
      };
    }));
  }

  static async getPostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) throw new AppError("INVALID_POST_ID");

    const post = await PostService.getPostById(id);
    // Unpublished posts don't exist for anyone but the admin
    if (!post || (!post.published && req.user?.role !== "admin")) throw new AppError("POST_NOT_FOUND");

    // Size data for referenced uploads so the client can render responsive
    // <img srcset>. A failure here must never break showing the post.
    let images = {};
    try {
      images = await MediaService.imagesForContent(post.content);
    } catch (err) {
      console.error("imagesForContent failed:", err);
    }

    // Series and neighbours are extras: never fail the post because of them.
    let series = null;
    let neighbours = { prev: null, next: null } as Awaited<ReturnType<typeof PostService.getNeighbours>>;
    try {
      if (post.series) {
        const parts = await PostService.getSeries(post.series);
        const index = parts.findIndex((p) => p._id.equals(post._id));
        // A draft isn't counted among the published parts yet: part 0. The
        // name must still come back, or the editor would clear it on save.
        series = { name: post.series, part: index + 1, total: parts.length, posts: parts };
      }
      if (post.published) neighbours = await PostService.getNeighbours(post.createdAt);
    } catch (err) {
      console.error("post extras failed:", err);
    }

    return res.json({
      ...post.toJSON(),
      images,
      readingMinutes: readingMinutes(post.content),
      series,
      ...neighbours,
    });
  }

  static async createPost(req: Request, res: Response): Promise<Response> {
    const authorId = req.user?._id;
    if (!isObjectId(authorId)) throw new AppError("UNAUTHORIZED");

    const fields = validatePostFields(req.body ?? {}, true);
    const post = await PostService.createPost(new Types.ObjectId(authorId), {
      title: fields.title!,
      summary: fields.summary!,
      content: fields.content!,
      published: fields.published ?? true,
      tags: fields.tags ?? [],
      series: fields.series ?? "",
      mcpVisible: fields.mcpVisible ?? true,
    });
    return res.status(201).json(post);
  }

  static async patchPostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) throw new AppError("INVALID_POST_ID");

    const post = await PostService.patchPostById(id, validatePostFields(req.body ?? {}, false));
    return res.json(post);
  }

  static async deletePostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) throw new AppError("INVALID_POST_ID");

    await PostService.deletePostById(id);
    return res.status(204).send();
  }
}

export default PostController;
