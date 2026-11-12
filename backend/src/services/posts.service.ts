import { FilterQuery, Types, SortOrder } from "mongoose";
import PostModel, { IPostDocument } from "../models/Post";
import CommentModel from "../models/Comment";
import { IPost } from "../types/post";
import { AppError } from "../config/errors";

import {
  isObjectId,
  sanitizeText,
  sanitizeMongoInput,
  escapeRegex
} from "../utils/validation";

// Input to createPost/patchPostById is already validated and sanitised by the
// controller (utils/validation, utils/postMeta); the service trusts it.
type PostFields = Pick<IPost, "title" | "summary" | "content" | "published" | "tags" | "series">;

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

  // null when there is no such post
  static async getPostById(id: string): Promise<IPostDocument | null> {
    if (!isObjectId(id)) return null;
    return PostModel.findById(id);
  }

  static async patchPostById(id: string, fields: Partial<PostFields>): Promise<IPostDocument> {
    const update: Partial<PostFields> = {};
    for (const key of ["title", "summary", "content", "published", "tags", "series"] as const) {
      if (fields[key] !== undefined) (update as Record<string, unknown>)[key] = fields[key];
    }
    const post = isObjectId(id) ? await PostModel.findByIdAndUpdate(id, update, { new: true }) : null;
    if (!post) throw new AppError("POST_NOT_FOUND");
    return post;
  }

  static async createPost(author: Types.ObjectId, fields: PostFields): Promise<IPostDocument> {
    return PostModel.create({ author, ...fields });
  }

  // _id and dates of every published post, newest first (sitemap)
  static async listPublishedForSitemap(): Promise<{ _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date }[]> {
    return PostModel.find({ published: true })
      .select("_id updatedAt createdAt")
      .sort({ createdAt: -1 })
      .lean();
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
  static async deletePostById(id: string): Promise<void> {
    if (!isObjectId(id)) throw new AppError("POST_NOT_FOUND");

    const deleted = await PostModel.findOneAndDelete({ _id: id, published: false });
    if (deleted) {
      await CommentModel.deleteMany({ post: deleted._id });
      return;
    }
    throw new AppError((await PostModel.exists({ _id: id })) ? "POST_IS_PUBLISHED" : "POST_NOT_FOUND");
  }
}

export default PostService;
