import { FilterQuery, Types, SortOrder } from "mongoose";
import CommentModel, { ICommentDocument } from "../models/Comment";
import { IComment } from "../types/comment";

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

  static async getCommentById(id: string): Promise<ICommentDocument | null> {
    if (!isObjectId(id)) return null;

    try {
      return CommentModel.findById(id)
        .populate("author", "name");
    } catch (err) {
      console.error("Error: getCommentById:", err);
      return null;
    }
  }

  static async patchCommentById(
    id: string,
    partial: Partial<ICommentDocument>
  ): Promise<ICommentDocument | null> {
    if (!isObjectId(id)) return null;

    const updateData: Partial<ICommentDocument> = {};
    if (partial.content !== undefined) {
      updateData.content = sanitizeMongoInput(sanitizeText(partial.content));
    }
    if (partial.published !== undefined) {
      updateData.published = partial.published;
    }

    try {
      return CommentModel.findByIdAndUpdate(id, updateData, {
        new: true
      }).populate("author", "name");
    } catch (err) {
      console.error("Error: patchCommentById:", err);
      return null;
    }
  }

  static async createComment(data: Partial<IComment>): Promise<ICommentDocument | null> {
    if (!data.author || !isObjectId(String(data.author))) {
      console.error("Error: createComment: invalid author");
      return null;
    }

    try {
      const newComment = new CommentModel({
        author: data.author,
        post: data.post,
        content: sanitizeMongoInput(sanitizeText(data.content)),
        published: data.published ?? true
      });

      const saved = await newComment.save();

      return saved.populate("author", "name");
    } catch (err) {
      console.error("Error: createComment:", err);
      return null;
    }
  }

  static async deleteCommentById(id: string): Promise<boolean> {
    if (!isObjectId(id)) return false;

    try {
      const result = await CommentModel.updateOne(
        { _id: id },
        { published: false }
      );

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error: deleteCommentById:", err);
      return false;
    }
  }
}

export default CommentService;
