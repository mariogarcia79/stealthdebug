import PostModel from "../models/Post";
import PageService from "./pages.service";
import { env } from "../config/env";
import { SITE_URL, postUrl } from "../config/site";
import { onSiteChanged } from "../utils/siteEvents";

// Tells search engines which public URLs changed, as soon as they change:
// a post published, edited, unpublished or deleted (in any language), the
// about page saved. IndexNow (https://www.indexnow.org) reaches Bing, Yandex,
// Seznam, Naver and others with one request. Google has no equivalent (its
// sitemap "ping" was retired in 2023): it reads /sitemap.xml, always current,
// on its own schedule.
//
// How: after writes settle (DEBOUNCE_MS), the set of public URLs and their
// modification times is read again and compared with the previous one. Only
// what differs is sent, so drafts, comments or a user logging in send
// nothing. The first snapshot is taken at startup; changes made while the
// backend was down aren't sent (the sitemap still has them).
//
// Off unless INDEXNOW_KEY is set (config/env.ts). The key is published at
// /indexnow.txt (nginx -> /api/indexnow.txt), where search engines verify it.

const ENDPOINT = "https://api.indexnow.org/indexnow";
const DEBOUNCE_MS = 5_000;
// A post page in a language: the lists that show it change with it
const LISTS = [`${SITE_URL}/`, `${SITE_URL}/blog`];

export type Snapshot = Map<string, number>;

// Every public URL that depends on the database, with when it last changed
export async function snapshot(): Promise<Snapshot> {
  const posts = await PostModel.find({ published: true }).select("_id lang translationOf updatedAt").lean();
  const published = new Set(posts.filter((p) => !p.translationOf).map((p) => String(p._id)));
  const out: Snapshot = new Map();
  for (const p of posts) {
    // a translation is public only with its original
    if (p.translationOf && !published.has(String(p.translationOf))) continue;
    const url = p.translationOf ? postUrl(p.translationOf, p.lang) : postUrl(p._id);
    out.set(url, (p.updatedAt as Date)?.getTime() ?? 0);
  }
  const about = await PageService.get("about");
  if (about.content.trim()) out.set(`${SITE_URL}/about`, about.updatedAt?.getTime() ?? 0);
  return out;
}

// URLs added, changed or removed (IndexNow wants all three), plus the
// listing pages when a post changed
export function changedUrls(before: Snapshot, after: Snapshot): string[] {
  const urls = new Set<string>();
  for (const [url, t] of after) if (before.get(url) !== t) urls.add(url);
  for (const url of before.keys()) if (!after.has(url)) urls.add(url);
  if ([...urls].some((u) => u.startsWith(`${SITE_URL}/blog/`))) LISTS.forEach((u) => urls.add(u));
  return [...urls];
}

export async function submit(urls: string[], key = env.indexNowKey): Promise<void> {
  if (!key || urls.length === 0) return;
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key,
      keyLocation: `${SITE_URL}/indexnow.txt`,
      urlList: urls.slice(0, 10_000),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // 200 OK, 202 Accepted (key being verified)
  if (r.status !== 200 && r.status !== 202) throw new Error(`IndexNow: HTTP ${r.status}`);
}

class SiteUpdates {
  private static last: Snapshot | null = null;
  private static timer: NodeJS.Timeout | null = null;
  private static running: Promise<void> = Promise.resolve();

  // From index.ts, once the database is connected
  static async start(): Promise<void> {
    if (!env.indexNowKey) {
      console.log("IndexNow: off (INDEXNOW_KEY not set)");
      return;
    }
    SiteUpdates.last = await snapshot();
    onSiteChanged(() => {
      if (SiteUpdates.timer) clearTimeout(SiteUpdates.timer);
      SiteUpdates.timer = setTimeout(() => {
        SiteUpdates.timer = null;
        // one comparison at a time, so none is lost or sent twice
        SiteUpdates.running = SiteUpdates.running.then(SiteUpdates.check);
      }, DEBOUNCE_MS);
      SiteUpdates.timer.unref();
    });
    console.log(`IndexNow: on (${SiteUpdates.last.size} public URLs)`);
  }

  private static async check(): Promise<void> {
    try {
      const next = await snapshot();
      const urls = changedUrls(SiteUpdates.last ?? next, next);
      if (urls.length) {
        await submit(urls);
        console.log(`IndexNow: sent ${urls.length} URL(s)`);
      }
      // only once sent: on failure the next change sends these again
      SiteUpdates.last = next;
    } catch (err) {
      console.error("IndexNow failed:", err);
    }
  }
}

export default SiteUpdates;
