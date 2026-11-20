import { Response } from "express";
import { onSiteChanged } from "./siteEvents";

// Generated public documents (sitemap, feed, llms.txt, Markdown copies, the
// meta tags of post pages), kept in memory until the site changes: any write
// to a post, page or user (utils/siteEvents) drops them all, so the next
// request rebuilds from the database and is never stale.
//
// sendCached's responses carry Last-Modified (the time of the last change)
// and an ETag (Express, from the body), with "no-cache": clients and
// Cloudflare may keep a copy but must check it every time, and that check is
// a cheap 304 here.
//
// One backend process (services/backend.container): the cache is per process.

const entries = new Map<string, unknown>();
// Bumped on every change; a build that started before a change isn't stored
let generation = 0;
// Whole seconds (HTTP dates have no more), strictly increasing: a change in
// the same second as the copy a client has must still look newer to it.
let lastModified = Math.ceil(Date.now() / 1000) * 1000;

onSiteChanged(() => {
  generation++;
  entries.clear();
  lastModified = Math.max(lastModified + 1000, Math.ceil(Date.now() / 1000) * 1000);
});

export const lastChange = (): Date => new Date(lastModified);

// The cached value, or build (and store) it. A build that throws isn't
// stored and the error goes to the caller (404s etc.); nor is null (nothing
// there: random ids must not fill the cache).
export async function cached<T>(key: string, build: () => Promise<T>): Promise<T> {
  if (entries.has(key)) return entries.get(key) as T;
  const gen = generation;
  const value = await build();
  if (gen === generation && value != null) entries.set(key, value);
  return value;
}

export interface Built { body: string; type: string; headers?: Record<string, string> }

export async function sendCached(res: Response, key: string, build: () => Promise<Built>): Promise<Response> {
  const doc = await cached(key, build);
  return res
    .status(200)
    .type(doc.type)
    .set({ "Cache-Control": "public, no-cache", "Last-Modified": lastChange().toUTCString(), ...doc.headers })
    // res.send adds the ETag and answers 304 itself when the client's copy is current
    .send(doc.body);
}

// Tests
export const cacheSize = (): number => entries.size;
