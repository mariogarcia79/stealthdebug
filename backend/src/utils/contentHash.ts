import { createHash } from "crypto";

// Version of a post's editable content, for change requests: a revision
// records the hash of its target when proposed; if the post's hash differs
// later, the revision is outdated. (Unlike updatedAt, it ignores changes
// that don't touch the content, such as publishing.)
export function contentHash(p: { title: string; summary: string; content: string; tags?: string[]; series?: string }): string {
  const data = JSON.stringify([p.title, p.summary, p.content, p.tags ?? [], p.series ?? ""]);
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}
