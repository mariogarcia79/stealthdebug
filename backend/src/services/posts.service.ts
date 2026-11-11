import { FilterQuery, Types, SortOrder } from "mongoose";
import PostModel, { IPostDocument } from "../models/Post";
import CommentModel from "../models/Comment";
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
    skip = 0,
    includeDrafts = false
  }: {
    sorted?: boolean;
    filter?: Partial<IPost>;
    limit?: number;
    skip?: number;
    includeDrafts?: boolean;   // admin only: unpublished posts too
  }): Promise<IPostDocument[]> {
    const mongoFilter = this.buildFilter(filter);

    if (mongoFilter.published == null && !includeDrafts) mongoFilter.published = true;

    const sortOrder: { [key: string]: SortOrder } = {
      createdAt: sorted ? "desc" : "asc"
    };

    return PostModel.find(mongoFilter).sort(sortOrder).skip(skip).limit(limit);
  }

  // True if the post exists and can be seen by this requester: published
  // posts by anyone, unpublished ones only by the admin.
  static async isVisible(id: string, isAdmin: boolean): Promise<boolean> {
    if (!isObjectId(id)) return false;
    const filter = isAdmin ? { _id: id } : { _id: id, published: true };
    return !!(await PostModel.exists(filter));
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
    if (partial.tags !== undefined) updateData.tags = partial.tags;
    if (partial.series !== undefined) updateData.series = partial.series;

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
        published: data.published ?? true,
        tags: data.tags ?? [],
        series: data.series ?? ""
      });

      return await newPost.save();
    } catch (err) {
      console.error("Error: createPost:", err);
      return null;
    }
  }

  // Published posts in the same series, oldest first (part 1, 2, ...).
  static async getSeries(series: string): Promise<{ _id: Types.ObjectId; title: string }[]> {
    if (!series) return [];
    return PostModel.find({ series, published: true })
      .sort({ createdAt: 1 })
      .select("_id title")
      .limit(100)
      .lean();
  }

  // Previous (older) and next (newer) published post.
  static async getNeighbours(createdAt: Date): Promise<{
    prev: { _id: Types.ObjectId; title: string } | null;
    next: { _id: Types.ObjectId; title: string } | null;
  }> {
    const [prev, next] = await Promise.all([
      PostModel.findOne({ published: true, createdAt: { $lt: createdAt } }).sort({ createdAt: -1 }).select("_id title").lean(),
      PostModel.findOne({ published: true, createdAt: { $gt: createdAt } }).sort({ createdAt: 1 }).select("_id title").lean(),
    ]);
    return { prev, next };
  }

  // Permanent delete, for drafts only: a published post must be unpublished
  // first, so a live post (and its readers' comments) can't be destroyed by
  // one click. The post's comments are deleted with it. Its images stay in
  // the media library (shown as unused there).
  static async deletePostById(id: string): Promise<"deleted" | "published" | "not-found"> {
    if (!isObjectId(id)) return "not-found";

    const deleted = await PostModel.findOneAndDelete({ _id: id, published: false });
    if (deleted) {
      await CommentModel.deleteMany({ post: deleted._id });
      return "deleted";
    }
    return (await PostModel.exists({ _id: id })) ? "published" : "not-found";
  }
}

export default PostService;
