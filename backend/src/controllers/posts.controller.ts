import { Request, Response } from "express";
import { Types } from "mongoose";

import PostService from "../services/posts.service";
import MediaService from "../services/media.service";
import { IPost } from "../types/post";

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
      const posts = await PostService.getAllPosts({ sorted: true, limit, skip });
      return res.json(posts);
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
      if (!post) {
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
      return res.json({ ...post.toJSON(), images });

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async createPost(req: Request, res: Response): Promise<Response> {
    const _id = req.user?._id;
    const { title, summary, content } = req.body;

    if (!isObjectId(_id)) {
      return sendError(res, 'UNAUTHORIZED');
    }

    try {
      const cleanTitle   = validateInput(title,   false, MAX_TITLE_LENGTH);
      const cleanSummary = validateInput(summary, false, MAX_SUMMARY_LENGTH);
      const cleanContent = validateInput(content, true,  MAX_CONTENT_LENGTH);
    
      const newPost = await PostService.createPost({
        author: new Types.ObjectId(_id),
        title: cleanTitle,
        summary: cleanSummary,
        content: cleanContent
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
