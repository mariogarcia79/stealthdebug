import { FilterQuery, Types, SortOrder } from "mongoose";
import PostModel, { IPostDocument } from "../models/Post";
import { IPost } from "../types/post";

import {
  isObjectId,
  sanitizeText,
  sanitizeMarkdown,
  sanitizeMongoInput,
  escapeRegex
} from "../utils/validation";

class PostService {

  private static buildFilter(filter?: Partial<IPost>): FilterQuery<IPost> {
    const mongoFilter: FilterQuery<IPost> = {};
    if (!filter) return mongoFilter;

    const allowedFields: (keyof IPost)[] = [
      "author",
      "title",
      "summary",
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

  static async getAllPosts({
    sorted = true,
    filter,
    limit = 50,
    skip = 0
  }: {
    sorted?: boolean;
    filter?: Partial<IPost>;
    limit?: number;
    skip?: number;
  }): Promise<IPostDocument[]> {
    const mongoFilter = this.buildFilter(filter);

    if (mongoFilter.published == null) mongoFilter.published = true;

    const sortOrder: { [key: string]: SortOrder } = {
      createdAt: sorted ? "desc" : "asc"
    };

    return PostModel.find(mongoFilter).sort(sortOrder).skip(skip).limit(limit);
  }

  static async getPostById(id: string): Promise<IPostDocument | null> {
    if (!isObjectId(id)) return null;
    try {
      return await PostModel.findById(id);
    } catch (err) {
      console.error("Error: getPostById:", err);
      return null;
    }
  }

  static async patchPostById(
    id: string,
    partial: Partial<IPostDocument>
  ): Promise<IPostDocument | null> {
    if (!isObjectId(id)) return null;

    const updateData: Partial<IPostDocument> = {};
    if (partial.title !== undefined) updateData.title = sanitizeText(partial.title);
    if (partial.summary !== undefined) updateData.summary = sanitizeText(partial.summary);
    if (partial.content !== undefined) updateData.content = sanitizeMarkdown(partial.content);
    if (partial.published !== undefined) updateData.published = partial.published;

    try {
      return await PostModel.findByIdAndUpdate(id, updateData, { new: true });
    } catch (err) {
      console.error("Error: patchPostById:", err);
      return null;
    }
  }

  static async createPost(data: Partial<IPost>): Promise<IPostDocument | null> {
    if (!data.author || !isObjectId(String(data.author))) {
      console.error("Error: createPost: invalid author");
      return null;
    }

    try {
      const newPost = new PostModel({
        author: data.author,
        title: sanitizeText(data.title),
        summary: sanitizeText(data.summary),
        content: sanitizeMarkdown(data.content),
        published: data.published ?? true
      });

      return await newPost.save();
    } catch (err) {
      console.error("Error: createPost:", err);
      return null;
    }
  }

  static async deletePostById(id: string): Promise<boolean> {
    if (!isObjectId(id)) return false;

    try {
      const result = await PostModel.updateOne(
        { _id: id },
        { published: false }
      );

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error: deletePostById:", err);
      return false;
    }
  }
}

export default PostService;
