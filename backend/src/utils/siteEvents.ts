import { EventEmitter } from "events";
import type { Schema } from "mongoose";

// "Something readers can see may have changed": a post, a translation, the
// about page or a user's name (bylines). The models fire it from their
// middleware (models/Post.ts, Page.ts, User.ts), so every write is covered
// wherever it comes from: the editor, an accepted change request, a script.
//
// Listeners: utils/publicCache.ts (drops the cached sitemap, feed, llms.txt,
// Markdown copies and post pages at once) and services/siteUpdates.service.ts
// (tells search engines which URLs changed, IndexNow).
//
// Imports no models (they load this module), only mongoose's types.

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

export const SITE_CHANGED = "changed";

export function siteChanged(): void {
  emitter.emit(SITE_CHANGED);
}

export function onSiteChanged(listener: () => void): () => void {
  emitter.on(SITE_CHANGED, listener);
  return () => emitter.off(SITE_CHANGED, listener);
}

// Mongoose middleware that fires siteChanged after every kind of write.
// (`create` runs the save hooks; updateMany/deleteMany don't, hence the list.)
const WRITE_HOOKS = [
  "save", "insertMany",
  "updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace",
  "deleteOne", "deleteMany", "findOneAndDelete",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fireOnWrites(schema: Schema<any>): void {
  // post() only runs after a write succeeded
  for (const hook of WRITE_HOOKS) schema.post(hook as "save", () => siteChanged());
}
