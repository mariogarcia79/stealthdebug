import { Request, Response } from "express";
import { Types } from "mongoose";

import CommentService from "../services/comments.service";
import PostService from "../services/posts.service";
import { MAX_COMMENT_LENGTH } from "../config/validation";
import { validateInput, isObjectId } from "../utils/validation";
import { AppError } from "../config/errors";

function checkIds(postId: string, id?: string): void {
  if (!isObjectId(postId)) throw new AppError("INVALID_POST_ID");
  if (id !== undefined && !isObjectId(id)) throw new AppError("INVALID_COMMENT_ID");
}

class CommentController {

  static async getAllComments(req: Request, res: Response): Promise<Response> {
    const postId = req.params.postId;
    checkIds(postId);

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
    const skip  = (page - 1) * limit;

    // Comments of an unpublished (or missing) post are hidden like the post
    if (!(await PostService.isVisible(postId, req.user?.role === "admin"))) throw new AppError("POST_NOT_FOUND");

    const comments = await CommentService.getAllComments({
      sorted: true,
      filter: { post: new Types.ObjectId(postId) },
      limit,
      skip,
    });
    return res.json(comments);
  }

  static async getCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;
    checkIds(postId, id);
    return res.json(await CommentService.getCommentOfPost(postId, id));
  }

  static async createComment(req: Request, res: Response): Promise<Response> {
    const userId = req.user?._id;
    const postId = req.params.postId;
    if (!isObjectId(userId)) throw new AppError("UNAUTHORIZED");
    if (!isObjectId(postId)) throw new AppError("INVALID_POST");

    // Only published posts (or any post, for the admin) accept comments
    if (!(await PostService.isVisible(postId, req.user?.role === "admin"))) throw new AppError("POST_NOT_FOUND");
    const content = validateInput(req.body?.content, false, MAX_COMMENT_LENGTH, "Comment");

    const comment = await CommentService.createComment({
      author: new Types.ObjectId(userId),
      post: new Types.ObjectId(postId),
      content,
    });
    return res.status(201).json(comment);
  }

  static async patchCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;
    checkIds(postId, id);

    const fields: { content?: string } = {};
    if (req.body?.content !== undefined) {
      fields.content = validateInput(req.body.content, false, MAX_COMMENT_LENGTH, "Comment");
    }
    await CommentService.getCommentOfPost(postId, id);
    return res.json(await CommentService.patchCommentById(id, fields));
  }

  static async deleteCommentById(req: Request, res: Response): Promise<Response> {
    const { postId, id } = req.params;
    checkIds(postId, id);

    await CommentService.getCommentOfPost(postId, id);
    await CommentService.deleteCommentById(id);
    return res.status(204).send();
  }
}

export default CommentController;
