import { FilterQuery, Types, SortOrder } from "mongoose";
import CommentModel, { ICommentDocument } from "../models/Comment";
import { IComment } from "../types/comment";
import { AppError } from "../config/errors";

import {
  isObjectId,
  escapeRegex,
  sanitizeMongoInput,
  sanitizeText
} from "../utils/validation";

class CommentService {

  private static buildFilter(filter?: Partial<IComment>): FilterQuery<IComment> {
    const mongoFilter: FilterQuery<IComment> = {};
    if (!filter) return mongoFilter;

    const allowedFields: (keyof IComment)[] = [
      "post",
      "author",
      "content",
      "published"
    ];

    for (const key of allowedFields) {
      const value = filter[key];
      if (value == null) continue;

      if (key === "author") {
        if (typeof value === "string" && isObjectId(value)) {
          mongoFilter.author = new Types.ObjectId(value);
        } else if (value instanceof Types.ObjectId) {
          mongoFilter.author = value;
        }
        continue;
      }

      if (key === "post") {
        if (typeof value === "string" && isObjectId(value)) {
          mongoFilter.post = new Types.ObjectId(value);
        } else if (value instanceof Types.ObjectId) {
          mongoFilter.post = value;
        }
        continue;
      }

      if (typeof value === "boolean") {
        mongoFilter[key] = value;
        continue;
      }

      if (typeof value === "string") {
        const safeStr = sanitizeMongoInput(sanitizeText(value));
        mongoFilter[key] = new RegExp(escapeRegex(safeStr), "i");
        continue;
      }

      if (value instanceof RegExp) {
        mongoFilter[key] = value;
      }
    }

    return mongoFilter;
  }

  static async getAllComments({
    sorted = true,
    filter,
    limit = 100,
    skip = 0
  }: {
    sorted?: boolean;
    filter?: Partial<IComment>;
    limit?: number;
    skip?: number;
  }): Promise<ICommentDocument[]> {
    const mongoFilter = this.buildFilter(filter);

    if (mongoFilter.published == null) mongoFilter.published = true;

    const sortOrder: { [key: string]: SortOrder } = {
      createdAt: sorted ? "desc" : "asc"
    };

    return CommentModel.find(mongoFilter)
      .sort(sortOrder)
      .skip(skip)
      .limit(limit)
      .populate("author", "name");
  }

  // null when there is no such comment
  static async getCommentById(id: string): Promise<ICommentDocument | null> {
    if (!isObjectId(id)) return null;
    return CommentModel.findById(id).populate("author", "name");
  }

  // A published comment of this post, or COMMENT_NOT_FOUND
  static async getCommentOfPost(postId: string, id: string): Promise<ICommentDocument> {
    const comment = await CommentService.getCommentById(id);
    if (!comment || comment.post.toString() !== postId) throw new AppError("COMMENT_NOT_FOUND");
    return comment;
  }

  // Author's user id, or null when there is no such comment (ownership checks)
  static async getAuthorId(id: string): Promise<string | null> {
    if (!isObjectId(id)) return null;
    const comment = await CommentModel.findById(id).select("author").lean();
    return comment ? comment.author.toString() : null;
  }

  // content is already validated and sanitised by the controller
  static async patchCommentById(id: string, fields: { content?: string }): Promise<ICommentDocument> {
    const update: Partial<IComment> = {};
    if (fields.content !== undefined) update.content = fields.content;
    const comment = isObjectId(id)
      ? await CommentModel.findByIdAndUpdate(id, update, { new: true }).populate("author", "name")
      : null;
    if (!comment) throw new AppError("COMMENT_NOT_FOUND");
    return comment;
  }

  static async createComment(data: { author: Types.ObjectId; post: Types.ObjectId; content: string }): Promise<ICommentDocument> {
    const saved = await CommentModel.create({ ...data, published: true });
    return saved.populate("author", "name");
  }

  // Comments are hidden (published: false), not removed: the post page
  // stops showing them. (Account deletion removes them for real.)
  static async deleteCommentById(id: string): Promise<void> {
    if (!isObjectId(id)) throw new AppError("COMMENT_NOT_FOUND");
    await CommentModel.updateOne({ _id: id }, { published: false });
  }
}

export default CommentService;
