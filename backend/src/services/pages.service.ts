import PageModel from "../models/Page";

// Standalone pages edited from the admin editor (only "about" for now).
export const PAGE_SLUGS = ["about"] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const isPageSlug = (s: string): s is PageSlug =>
  (PAGE_SLUGS as readonly string[]).includes(s);

class PageService {
  // A page that was never saved is empty: content "", updatedAt null
  static async get(slug: PageSlug): Promise<{ content: string; updatedAt: Date | null }> {
    const page = await PageModel.findOne({ slug }).select("content updatedAt").lean();
    return { content: page?.content ?? "", updatedAt: page?.updatedAt ?? null };
  }

  static async save(slug: PageSlug, content: string): Promise<{ content: string; updatedAt: Date | null }> {
    const page = await PageModel.findOneAndUpdate(
      { slug },
      { $set: { content } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return { content: page?.content ?? content, updatedAt: page?.updatedAt ?? null };
  }
}

export default PageService;
