import { Request, Response } from "express";
import { Types } from "mongoose";
import PostModel from "../models/Post";
import { isLang } from "../config/langs";
import { sendCached, lastChange } from "../utils/publicCache";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, postUrl, xmlEscape } from "../config/site";

// GET /api/feed.xml (served at /feed.xml by nginx): RSS 2.0 of the newest
// published posts. ?lang=es gives every post in that language where it has
// a translation (the same choice the blog list makes); without it, each post
// in the language it was written in.

const ITEMS = 20;

async function buildFeed(lang: string | null): Promise<string> {
  const originals = await PostModel.find({ published: true, translationOf: null })
    .sort({ createdAt: -1 }).limit(ITEMS).select("title summary tags lang createdAt").lean();
  const translations = lang
    ? await PostModel.find({ published: true, lang, translationOf: { $in: originals.map((p) => p._id) } })
      .select("title summary translationOf").lean()
    : [];
  const tr = new Map(translations.map((t) => [String(t.translationOf), t]));

  const items = originals.map((p) => {
    const t = p.lang !== lang ? tr.get(String(p._id)) : undefined;
    const link = postUrl(p._id as Types.ObjectId, t ? lang : null);
    return [
      "    <item>",
      `      <title>${xmlEscape((t ?? p).title)}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${(p.createdAt as Date).toUTCString()}</pubDate>`,
      `      <description>${xmlEscape((t ?? p).summary)}</description>`,
      ...(p.tags ?? []).map((tag) => `      <category>${xmlEscape(tag)}</category>`),
      "    </item>",
    ].join("\n");
  });

  const self = `${SITE_URL}/feed.xml${lang ? `?lang=${lang}` : ""}`;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    "  <channel>",
    `    <title>${SITE_NAME}</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <description>${xmlEscape(SITE_DESCRIPTION[lang ?? "en"])}</description>`,
    ...(lang ? [`    <language>${lang}</language>`] : []),
    `    <atom:link href="${xmlEscape(self)}" rel="self" type="application/rss+xml"/>`,
    `    <lastBuildDate>${lastChange().toUTCString()}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

class FeedController {
  static async getFeed(req: Request, res: Response): Promise<Response> {
    const lang = isLang(req.query.lang) ? req.query.lang : null;
    return sendCached(res, `feed:${lang ?? ""}`, async () => ({
      type: "application/rss+xml; charset=utf-8",
      body: await buildFeed(lang),
    }));
  }
}

export default FeedController;
