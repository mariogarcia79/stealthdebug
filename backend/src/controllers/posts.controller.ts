import { Request, Response } from "express";
import { Types } from "mongoose";

import PostService from "../services/posts.service";
import MediaService from "../services/media.service";
import { IPost } from "../types/post";
import { readingMinutes, normalizeTags, normalizeSeries } from "../utils/postMeta";
import { extractUploadFilenames, uploadUrl } from "../utils/media";

import { 
  validateInput,
  isObjectId
} from "../utils/validation";
import { sendError } from "../config/errors";

import {
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_SUMMARY_LENGTH
} from "../config/validation";


class PostController {

  static async getAllPosts(req: Request, res: Response): Promise<Response> {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip  = (page - 1) * limit;

    try {
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
    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async getPostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_POST_ID');
    }

    try {
      const post = await PostService.getPostById(id);
      // Unpublished posts don't exist for anyone but the admin
      if (!post || (!post.published && req.user?.role !== "admin")) {
        return sendError(res, 'POST_NOT_FOUND');
      }

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

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async createPost(req: Request, res: Response): Promise<Response> {
    const _id = req.user?._id;
    const { title, summary, content, tags, series, published } = req.body;

    if (!isObjectId(_id)) {
      return sendError(res, 'UNAUTHORIZED');
    }
    if (published !== undefined && typeof published !== "boolean") {
      return sendError(res, 'INVALID_INPUT', "published must be true or false");
    }

    try {
      const cleanTitle   = validateInput(title,   false, MAX_TITLE_LENGTH);
      const cleanSummary = validateInput(summary, false, MAX_SUMMARY_LENGTH);
      const cleanContent = validateInput(content, true,  MAX_CONTENT_LENGTH);
      let cleanTags: string[];
      let cleanSeries: string;
      try {
        cleanTags = normalizeTags(tags);
        cleanSeries = normalizeSeries(series);
      } catch (err) {
        return sendError(res, 'INVALID_INPUT', (err as Error).message);
      }
    
      const newPost = await PostService.createPost({
        author: new Types.ObjectId(_id),
        title: cleanTitle,
        summary: cleanSummary,
        content: cleanContent,
        tags: cleanTags,
        series: cleanSeries,
        published: published ?? true
      });

      if (!newPost) {
        return sendError(res, 'FAILED_CREATE_POST');
      }

      return res
        .status(201)
        .json(newPost);

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async patchPostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    const body: Partial<IPost> = {};

    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_POST_ID');
    }

    try {
      if (req.body.title !== undefined) {
        body.title = validateInput(req.body.title, false, MAX_TITLE_LENGTH);
      }
      if (req.body.summary !== undefined) {
        body.summary = validateInput(req.body.summary, false, MAX_SUMMARY_LENGTH);
      }
      if (req.body.content !== undefined) {
        body.content = validateInput(req.body.content, true, MAX_CONTENT_LENGTH);
      }
      if (req.body.published !== undefined) {
        if (typeof req.body.published !== "boolean") {
          return sendError(res, 'INVALID_INPUT', "published must be true or false");
        }
        body.published = req.body.published;
      }
      try {
        if (req.body.tags !== undefined) body.tags = normalizeTags(req.body.tags);
        if (req.body.series !== undefined) body.series = normalizeSeries(req.body.series);
      } catch (err) {
        return sendError(res, 'INVALID_INPUT', (err as Error).message);
      }

      const updatedPost = await PostService.patchPostById(id, body);
      
      if (!updatedPost) return sendError(res, 'POST_NOT_FOUND');

      return res.json(updatedPost);
    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async deletePostById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;

    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_POST_ID');
    }

    try {
      const deleted = await PostService.deletePostById(id);
    
      if (!deleted) {
        return sendError(res, 'POST_NOT_FOUND');
      }
      return res
        .status(204)
        .send();
    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
}

export default PostController;
