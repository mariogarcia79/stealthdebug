import { Request, Response } from "express";
import { Types } from "mongoose";
import PostModel from "../models/Post";
import UserModel from "../models/User";
import { env } from "../config/env";
import { isLang } from "../config/langs";
import { SITE_URL, SITE_NAME, pageTitle, postUrl } from "../config/site";
import { cached } from "../utils/publicCache";
import { extractUploadFilenames, uploadUrl } from "../utils/media";
import { isObjectId } from "../utils/validation";

// GET /api/html/blog/:id[?lang=xx] (nginx serves /blog/<id> from here): the
// frontend's own index.html with the post's title, description, canonical
// URL, hreflang alternates, Open Graph tags and JSON-LD in <head>, so link
// previews and crawlers that don't run JavaScript see the real post. The
// React app then starts exactly as from the frontend container.
//
// Anything that isn't a published post (a draft the admin opens, a wrong id)
// gets index.html untouched, as before: the app shows it or its 404.
//
// Only the tags are cached (utils/publicCache, dropped when a post changes);
// index.html is revalidated with the frontend on every request (a 304 inside
// the pod), so a frontend deploy, which renames the JS and CSS files, is
// picked up at once.

const OG_LOCALE: Record<string, string> = { en: "en_US", es: "es_ES" };

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// JSON inside <script>: nothing in it may close the element
const jsonInScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const absolute = (u: string) => (u.startsWith("/") ? SITE_URL + u : u);

// ---- index.html from the frontend

type Template = { html: string; etag: string | null };
let template: Template | null = null;

let loadTemplate = async (): Promise<string> => {
  const r = await fetch(`${env.frontendUrl}/index.html`, {
    headers: template?.etag ? { "If-None-Match": template.etag } : {},
    signal: AbortSignal.timeout(3000),
  });
  if (r.status === 304 && template) return template.html;
  if (!r.ok) throw new Error(`frontend index.html: HTTP ${r.status}`);
  template = { html: await r.text(), etag: r.headers.get("etag") };
  return template.html;
};

async function indexHtml(): Promise<string | null> {
  try {
    return await loadTemplate();
  } catch (err) {
    // the frontend restarting: the last good copy beats no page at all
    console.error("Post page: index.html:", err);
    return template?.html ?? null;
  }
}

// Tests: serve this instead of asking the frontend
export function setIndexTemplateForTests(html: string): void {
  loadTemplate = async () => html;
}

// ---- the post's tags

interface PostMeta { lang: string; head: string }

async function buildMeta(id: string, wanted: string | null): Promise<PostMeta | null> {
  const requested = await PostModel.findOne({ _id: new Types.ObjectId(id), published: true });
  if (!requested) return null;
  const originalId = (requested.translationOf ?? requested._id) as Types.ObjectId;
  const original = requested.translationOf
    ? await PostModel.findOne({ _id: originalId, published: true })
    : requested;
  if (!original) return null;
  const variants = await PostModel.find({ translationOf: originalId, published: true }).select("lang").lean();

  // the version shown: ?lang= if there is one, else the post asked for
  let post = requested;
  if (wanted && wanted !== requested.lang) {
    if (wanted === original.lang) post = original;
    else if (variants.some((v) => v.lang === wanted)) {
      post = (await PostModel.findOne({ translationOf: originalId, lang: wanted, published: true })) ?? requested;
    }
  }
  const isOriginal = post._id.equals(originalId);
  const url = postUrl(originalId, isOriginal ? null : post.lang);
  const title = oneLine(post.title);
  const description = oneLine(post.summary);
  const image = extractUploadFilenames(post.content)[0];
  const author = await UserModel.findById(original.author).select("name").lean();

  const langs = [
    { lang: original.lang, href: postUrl(originalId) },
    ...variants.map((v) => ({ lang: v.lang, href: postUrl(originalId, v.lang) })),
  ];

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    url,
    inLanguage: post.lang,
    datePublished: (original.createdAt as Date).toISOString(),
    dateModified: (post.updatedAt as Date).toISOString(),
    ...(author?.name ? { author: { "@type": "Person", name: author.name } } : {}),
    ...(image ? { image: absolute(uploadUrl(image)) } : {}),
    ...(post.tags?.length ? { keywords: post.tags.join(", ") } : {}),
    publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
  };

  const tags = [
    `<title>${attr(pageTitle(title))}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    ...(langs.length > 1
      ? [...langs.map((l) => `<link rel="alternate" hreflang="${l.lang}" href="${attr(l.href)}" />`),
         `<link rel="alternate" hreflang="x-default" href="${attr(postUrl(originalId))}" />`]
      : []),
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[post.lang] ?? post.lang}" />`,
    ...(image ? [`<meta property="og:image" content="${attr(absolute(uploadUrl(image)))}" />`] : []),
    `<meta property="article:published_time" content="${(original.createdAt as Date).toISOString()}" />`,
    `<meta property="article:modified_time" content="${(post.updatedAt as Date).toISOString()}" />`,
    ...(post.tags ?? []).map((t) => `<meta property="article:tag" content="${attr(t)}" />`),
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    // a data block, never executed (the CSP's script-src doesn't apply)
    `<script type="application/ld+json">${jsonInScript(ld)}</script>`,
  ];
  return { lang: post.lang, head: tags.map((t) => `    ${t}`).join("\n") };
}

// index.html marks its default tags with <!-- page-meta --> ... <!-- /page-meta -->;
// the post's replace them (or, without the markers, its <title>).
export function injectMeta(html: string, meta: PostMeta): string {
  const block = `<!-- page-meta -->\n${meta.head}\n    <!-- /page-meta -->`;
  let out = /<!-- page-meta -->[\s\S]*?<!-- \/page-meta -->/.test(html)
    ? html.replace(/<!-- page-meta -->[\s\S]*?<!-- \/page-meta -->/, () => block)
    : /<title>[\s\S]*?<\/title>/i.test(html)
      ? html.replace(/<title>[\s\S]*?<\/title>/i, () => block)
      : html.replace(/<\/head>/i, () => `${block}\n  </head>`);
  out = out.replace(/<html([^>]*?)\slang="[^"]*"/i, (_m, a) => `<html${a} lang="${meta.lang}"`);
  return out;
}

class PostPageController {
  static async getPostPage(req: Request, res: Response): Promise<Response> {
    const html = await indexHtml();
    // nginx then falls back to the frontend's own index.html
    if (html == null) return res.status(503).type("text/plain").send("frontend unavailable");

    const id = req.params.id;
    const lang = isLang(req.query.lang) ? req.query.lang : null;
    const meta = isObjectId(id) ? await cached(`page:${id}:${lang ?? ""}`, () => buildMeta(id, lang)) : null;
    return res
      .status(200)
      .type("text/html; charset=utf-8")
      // ETag (Express, from the body): a cheap 304 when nothing changed
      .set("Cache-Control", "no-cache")
      .send(meta ? injectMeta(html, meta) : html);
  }
}

export default PostPageController;
