import { FilterQuery, Types } from "mongoose";
import PostModel, { IPostDocument } from "../models/Post";
import { IPost } from "../types/post";
import { contentHash } from "../utils/contentHash";
import { isObjectId, escapeRegex } from "../utils/validation";

// What agents see of posts. All agent reads go through here, so the rules
// live in one place:
//  - drafts and published posts, but never a post excluded from MCP
//    (mcpVisible: false) nor a translation of one;
//  - never comments (this module doesn't touch them, and its results carry
//    no comment data).

export interface AgentPostSummary {
  id: string;
  title: string;
  summary: string;
  author: string;
  published: boolean;
  lang: string;
  translationOf: string | null;
  tags: string[];
  series: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentPost extends AgentPostSummary {
  content: string;
  contentHash: string;
  translations: { id: string; lang: string; published: boolean }[];
}

type Populated = Omit<IPost, "author"> & { _id: Types.ObjectId; author: { name?: string } | null };

function summary(p: Populated): AgentPostSummary {
  return {
    id: String(p._id),
    title: p.title,
    summary: p.summary,
    author: p.author?.name ?? "",
    published: p.published,
    lang: p.lang ?? "en",
    translationOf: p.translationOf ? String(p.translationOf) : null,
    tags: p.tags ?? [],
    series: p.series ?? "",
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

class AgentPostService {
  // Originals excluded from MCP
  private static async hiddenIds(): Promise<Types.ObjectId[]> {
    return PostModel.distinct("_id", { mcpVisible: false });
  }

  static async visibleFilter(): Promise<FilterQuery<IPost>> {
    const hidden = await AgentPostService.hiddenIds();
    return { mcpVisible: { $ne: false }, translationOf: { $nin: hidden } };
  }

  static async list(opts: {
    status?: "published" | "draft" | "all";
    tag?: string;
    series?: string;
    lang?: string;
    limit?: number;
    skip?: number;
  }): Promise<AgentPostSummary[]> {
    const q: FilterQuery<IPost> = await AgentPostService.visibleFilter();
    if (opts.status === "published") q.published = true;
    if (opts.status === "draft") q.published = false;
    if (opts.tag) q.tags = opts.tag;
    if (opts.series) q.series = new RegExp(`^${escapeRegex(opts.series)}$`, "i");
    if (opts.lang) q.lang = opts.lang;
    const posts = await PostModel.find(q)
      .select("-content")
      .sort({ createdAt: -1 })
      .skip(opts.skip ?? 0)
      .limit(Math.min(opts.limit ?? 50, 100))
      .populate("author", "name")
      .lean<Populated[]>();
    return posts.map(summary);
  }

  // The post document if agents may see it, else null (hidden = not found)
  static async getVisibleDocument(id: string): Promise<IPostDocument | null> {
    if (!isObjectId(id)) return null;
    const post = await PostModel.findById(id);
    if (!post || post.mcpVisible === false) return null;
    if (post.translationOf) {
      const original = await PostModel.findById(post.translationOf).select("mcpVisible").lean();
      if (!original || original.mcpVisible === false) return null;
    }
    return post;
  }

  static async get(id: string): Promise<AgentPost | null> {
    const doc = await AgentPostService.getVisibleDocument(id);
    if (!doc) return null;
    const p = await PostModel.findById(doc._id).populate("author", "name").lean<Populated>();
    if (!p) return null;
    const translations = p.translationOf
      ? []
      : await PostModel.find({ translationOf: p._id }).select("_id lang published").lean();
    return {
      ...summary(p),
      content: p.content,
      contentHash: contentHash(p),
      translations: translations.map((t) => ({ id: String(t._id), lang: t.lang, published: t.published })),
    };
  }
}

export default AgentPostService;
