import { Request, Response } from "express";
import { Types } from "mongoose";

import CommentService from "../services/comments.service";
import { IComment } from "../types/comment";
import { MAX_COMMENT_LENGTH } from "../config/validation";

import { 
  validateInput,
  isObjectId
} from "../utils/validation";
import { sendError } from "../config/errors";


class CommentController {

  static async getAllComments(req: Request, res: Response): Promise<Response> {
    const postId = req.params.postId;

    if (!isObjectId(postId)) {
      return sendError(res, 'INVALID_POST_ID');
    }

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
    const skip  = (page - 1) * limit;

    try {
      const comments = await CommentService.getAllComments({
        sorted: true,
        filter: { post: new Types.ObjectId(postId) },
        limit,
        skip
      });

      return res.json(comments);
    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async getCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;

    if (!isObjectId(postId)) {
      return sendError(res, 'INVALID_POST_ID');
    }
    
    if (!isObjectId(id)) { 
      return sendError(res, 'INVALID_COMMENT_ID');
    }

    try {
      const comment = await CommentService.getCommentById(id);

      if (!comment || comment.post.toString() !== postId) {
        return sendError(res, 'COMMENT_NOT_FOUND');
      }

      return res.json(comment);

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async createComment(req: Request, res: Response): Promise<Response> {
    const userId = req.user?._id;
    const postId = req.params.postId;
    const { content } = req.body;

    if (!isObjectId(userId)) {
      return sendError(res, 'UNAUTHORIZED');
    }

    if (!isObjectId(postId)) {
      return sendError(res, 'INVALID_POST');
    }

    try {
      const cleanContent = validateInput(content, false, MAX_COMMENT_LENGTH);

      const newComment = await CommentService.createComment({
        author: new Types.ObjectId(userId),
        post: new Types.ObjectId(postId),
        content: cleanContent,
      });

      if (!newComment) {
        return sendError(res, 'FAILED_CREATE_COMMENT');
      }

      return res
        .status(201)
        .json(newComment);

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async patchCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;
    const body: Partial<IComment> = {};
    
    if (!isObjectId(postId)) {
      return sendError(res, 'INVALID_POST_ID');
    }
    
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_COMMENT_ID');
    }

    if (req.body.content !== undefined) {
      try {
        body.content = validateInput(req.body.content, false, MAX_COMMENT_LENGTH);
      } catch (err) {
        return res
          .status(400)
          .json({ error: (err as Error).message });
      }
    }

    try {
      const comment = await CommentService.getCommentById(id);

      if (!comment || comment.post.toString() !== postId) {
        return sendError(res, 'COMMENT_NOT_FOUND');
      }

      const updatedComment = await CommentService.patchCommentById(id, body);
      return res.json(updatedComment);

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async deleteCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;

    if (!isObjectId(postId)) {
      return sendError(res, 'INVALID_POST_ID');
    }
    
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_COMMENT_ID');
    }

    try {
      const comment = await CommentService.getCommentById(id);

      if (!comment || comment.post.toString() !== postId) {
        return sendError(res, 'COMMENT_NOT_FOUND');
      }

      await CommentService.deleteCommentById(id);

      return res
        .status(204)
        .send();

    } catch (err) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
}

export default CommentController;
