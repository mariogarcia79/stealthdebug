import { Request, Response } from "express";
import { Types } from "mongoose";
import PostModel, { IPostDocument } from "../models/Post";
import UserModel from "../models/User";
import { env } from "../config/env";
import { AppError } from "../config/errors";
import { LANGS } from "../config/langs";
import { isObjectId } from "../utils/validation";

// Public, read-only access for AI tools without the MCP server:
//   /llms.txt                  the llms.txt convention: what the blog is, every published post
//   /blog/<id>.md              a published post as Markdown, in its original language
//   /blog/<id>.<lang>.md       the same post in another language, if translated
// (nginx maps these to /api/llms.txt and /api/md/<file>). Drafts never appear,
// nor posts unchecked as "Visible to agents (MCP)" (nor their translations):
// hidden from AI tools altogether.

const SITE = env.siteUrl;

const TEXT = {
  en: {
    by: "Author", date: "Published", updated: "Updated", lang: "Language", tags: "Tags", series: "Series", translations: "Also available in",
    wrote: (a: string, s: string) => `${a} wrote this post based on the work of ${s} and under the supervision of ${s}.`,
    translated: (a: string, s: string, from: string) => `${a} translated this post from ${from} with the consent of ${s}.`,
    original: "Original", names: { en: "English", es: "Spanish" } as Record<string, string>,
  },
  es: {
    by: "Autor", date: "Publicado", updated: "Actualizado", lang: "Idioma", tags: "Etiquetas", series: "Serie", translations: "También disponible en",
    wrote: (a: string, s: string) => `${a} escribió este artículo a partir del trabajo de ${s} y bajo la supervisión de ${s}.`,
    translated: (a: string, s: string, from: string) => `${a} tradujo este artículo del ${from} con el consentimiento de ${s}.`,
    original: "Original", names: { en: "inglés", es: "español" } as Record<string, string>,
  },
};
const text = (lang: string) => TEXT[lang as keyof typeof TEXT] ?? TEXT.en;

export const mdUrl = (originalId: unknown, lang?: string) => `${SITE}/blog/${originalId}${lang ? `.${lang}` : ""}.md`;
const day = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "");
// One line: titles and summaries can't break the Markdown structure
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// Site-relative links and images (/api/uploads/..., /blog/...) made absolute
function absolutize(md: string): string {
  return md
    .replace(/(\]\(\s*<?)\/(?!\/)/g, `$1${SITE}/`)
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*<?)\/(?!\/)/gm, `$1${SITE}/`)
    .replace(/(\b(?:href|src)\s*=\s*["'])\/(?!\/)/gi, `$1${SITE}/`);
}

async function names(ids: unknown[]): Promise<Map<string, { name: string; role: string }>> {
  const users = await UserModel.find({ _id: { $in: ids.filter(Boolean) } }).select("name role").lean();
  return new Map(users.map((u) => [String(u._id), { name: u.name, role: String(u.role) }]));
}

function send(res: Response, type: string, body: string): Response {
  return res.status(200).type(type).set({
    "Cache-Control": "public, max-age=3600",
    // the HTML page is the one to index; these are copies for tools
    "X-Robots-Tag": "noindex",
  }).send(body);
}

class LlmsController {
  static async llmsTxt(_req: Request, res: Response): Promise<Response> {
    const originals = await PostModel.find({ published: true, translationOf: null, mcpVisible: { $ne: false } }).sort({ createdAt: -1 }).lean();
    const translations = await PostModel.find({ published: true, translationOf: { $in: originals.map((p) => p._id) } })
      .select("translationOf lang").lean();
    const byOriginal = new Map<string, string[]>();
    for (const t of translations) byOriginal.set(String(t.translationOf), [...(byOriginal.get(String(t.translationOf)) ?? []), t.lang]);

    const lines = [
      "# stealthdebug",
      "",
      "> Hands-on write-ups on reverse engineering embedded systems: opening the hardware, dumping and breaking down firmware, and bypassing software protections.",
      "",
      `Blog by Mario García Carbonero. Posts are written in English or Spanish; some have translations. Every post below links to a Markdown version; the HTML pages are at ${SITE}/blog/<id>.`,
      "",
      "## Posts",
      "",
      ...originals.map((p) => {
        const other = (byOriginal.get(String(p._id)) ?? []).map((l) => `[${TEXT.en.names[l]}](${mdUrl(p._id, l)})`);
        return `- [${oneLine(p.title)}](${mdUrl(p._id)}): ${oneLine(p.summary)} (${p.lang}, ${day(p.createdAt as Date)})${other.length ? ` · ${other.join(", ")}` : ""}`;
      }),
      "",
      "## Optional",
      "",
      `- [About](${SITE}/about)`,
      `- [Sitemap](${SITE}/sitemap.xml)`,
      "",
    ];
    return send(res, "text/plain; charset=utf-8", lines.join("\n"));
  }

  // :file = <id>.md | <id>.<lang>.md
  static async postMarkdown(req: Request, res: Response): Promise<Response> {
    const m = /^([0-9a-f]{24})(?:\.([a-z]{2}))?\.md$/.exec(req.params.file);
    if (!m || !isObjectId(m[1]) || (m[2] && !(LANGS as readonly string[]).includes(m[2]))) throw new AppError("POST_NOT_FOUND");
    const original = await PostModel.findOne({ _id: new Types.ObjectId(m[1]), published: true, translationOf: null, mcpVisible: { $ne: false } });
    if (!original) throw new AppError("POST_NOT_FOUND");
    let post: IPostDocument = original;
    if (m[2] && m[2] !== original.lang) {
      const tr = await PostModel.findOne({ translationOf: original._id, lang: m[2], published: true });
      if (!tr) throw new AppError("POST_NOT_FOUND");
      post = tr;
    }
    const others = await PostModel.find({ translationOf: original._id, published: true }).select("lang").lean();
    const who = await names([post.author, post.supervisor, original.author]);
    const author = who.get(String(post.author));
    const supervisor = who.get(String(post.supervisor))?.name ?? "";
    const T = text(post.lang);
    const isTranslation = post !== original;

    const meta = [
      `- ${T.by}: ${(isTranslation ? who.get(String(original.author))?.name : author?.name) ?? ""}`,
      `- ${T.date}: ${day(original.createdAt as Date)}`,
      `- ${T.updated}: ${day(post.updatedAt as Date)}`,
      `- ${T.lang}: ${post.lang}`,
      post.tags?.length ? `- ${T.tags}: ${post.tags.join(", ")}` : "",
      post.series ? `- ${T.series}: ${oneLine(post.series)}` : "",
      `- URL: ${SITE}/blog/${original._id}${isTranslation ? `?lang=${post.lang}` : ""}`,
    ].filter(Boolean);
    const alts = [
      ...(isTranslation ? [`[${T.original} (${T.names[original.lang]})](${mdUrl(original._id)})`] : []),
      ...others.filter((o) => o.lang !== post.lang).map((o) => `[${T.names[o.lang]}](${mdUrl(original._id, o.lang)})`),
    ];
    const banner = author?.role === "agent"
      ? (isTranslation ? T.translated(author.name, supervisor, T.names[original.lang]) : T.wrote(author.name, supervisor))
      : "";

    const md = [
      `# ${oneLine(post.title)}`,
      "",
      `> ${oneLine(post.summary)}`,
      "",
      ...meta,
      ...(alts.length ? [`- ${T.translations}: ${alts.join(", ")}`] : []),
      "",
      ...(banner ? [`*${banner}*`, ""] : []),
      "---",
      "",
      absolutize(post.content).trim(),
      "",
    ].join("\n");
    res.set("Content-Language", post.lang);
    return send(res, "text/markdown; charset=utf-8", md);
  }
}

export default LlmsController;
