import { Request, Response } from "express";
import PostService from "../services/posts.service";
import PageService from "../services/pages.service";
import { env } from "../config/env";

// Public address of the site, used in the sitemap's absolute URLs
const SITE_URL = env.siteUrl;

// Pages that aren't posts. Legal pages are listed once (the same URL serves
// both languages; the visitor's choice or ?lang= picks one).
const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/",         priority: "1.0", changefreq: "weekly" },
  { path: "/blog",     priority: "0.9", changefreq: "weekly" },
  { path: "/privacy",  priority: "0.2", changefreq: "yearly" },
  { path: "/terms",    priority: "0.2", changefreq: "yearly" },
  { path: "/legal",    priority: "0.1", changefreq: "yearly" },
  { path: "/security", priority: "0.2", changefreq: "yearly" },
];

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function urlEntry(loc: string, lastmod?: Date, changefreq?: string, priority?: string): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(SITE_URL + loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : "",
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : "",
    priority ? `    <priority>${priority}</priority>` : "",
    "  </url>",
  ].filter(Boolean).join("\n");
}

class SitemapController {
  // GET /api/sitemap.xml (served at /sitemap.xml by nginx): published posts only
  static async getSitemap(_req: Request, res: Response): Promise<Response> {
    try {
      const posts = await PostService.listPublishedForSitemap();
      const newest = posts.reduce<Date | undefined>((max, p) => {
        const d = (p.updatedAt ?? p.createdAt) as Date | undefined;
        return d && (!max || d > max) ? d : max;
      }, undefined);

      // The about page is listed once it has content
      const about = await PageService.get("about");

      const entries = [
        ...STATIC_PAGES.map((p) =>
          urlEntry(p.path, p.path === "/" || p.path === "/blog" ? newest : undefined, p.changefreq, p.priority)),
        ...(about?.content?.trim() ? [urlEntry("/about", about.updatedAt as Date, "monthly", "0.7")] : []),
        ...posts.map((p) => urlEntry(`/blog/${p._id}`, (p.updatedAt ?? p.createdAt) as Date, "monthly", "0.8")),
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;

      return res
        .status(200)
        .type("application/xml")
        .set("Cache-Control", "public, max-age=3600")
        .send(xml);
    } catch (err) {
      console.error("Error: sitemap:", err);
      return res.status(500).type("text/plain").send("sitemap unavailable");
    }
  }
}

export default SitemapController;
