import path from "path";
import { randomBytes } from "crypto";

// Pure helpers for the media library (no I/O), kept separate so they can be
// unit-tested without MongoDB or sharp.

export const UPLOADS_URL_PREFIX = "/api/uploads";
export const VARIANTS_DIRNAME = "variants";

// Widths of the resized copies. Only widths smaller than the original are
// generated; the original itself is always the largest srcset candidate.
export const VARIANT_WIDTHS = [480, 960, 1600] as const;

// New uploads are stored at most this wide (old originals are never touched).
export const MAX_ORIGINAL_WIDTH = 2400;

// Files in the uploads directory that are treated as library images.
// Deliberately strict: no path separators, no leading dot, known extensions.
const SAFE_UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(webp|png|jpe?g|gif)$/i;

export function isSafeUploadName(name: unknown): name is string {
  return typeof name === "string" && SAFE_UPLOAD_NAME.test(name) && !name.includes("..");
}

export function variantWidthsFor(originalWidth: number): number[] {
  return VARIANT_WIDTHS.filter((w) => w < originalWidth);
}

export function variantFilename(filename: string, width: number): string {
  const base = filename.slice(0, filename.length - path.extname(filename).length);
  return `${base}-${width}w.webp`;
}

export function uploadUrl(filename: string): string {
  return `${UPLOADS_URL_PREFIX}/${filename}`;
}

export function variantUrl(variantFile: string): string {
  return `${UPLOADS_URL_PREFIX}/${VARIANTS_DIRNAME}/${variantFile}`;
}

// File names of uploads referenced anywhere in a post's markdown, e.g.
// "![x](/api/uploads/a.webp)" or an absolute "https://host/api/uploads/a.webp".
export function extractUploadFilenames(content: string): string[] {
  const found = new Set<string>();
  const re = /\/api\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|png|jpe?g|gif))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (isSafeUploadName(m[1])) found.add(m[1]);
  }
  return [...found];
}

export function contentReferences(content: string, filename: string): boolean {
  return content.includes(uploadUrl(filename));
}

// "My Photo (1).PNG" -> "my-photo--1-"; falls back to "image".
export function safeBaseName(originalName: string): string {
  const base = originalName
    .slice(0, originalName.length - path.extname(originalName).length)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 80);
  return base || "image";
}

export function newUploadFilename(originalName: string, now = Date.now()): string {
  // 6 chars from [A-Za-z0-9], same shape as historical uploads
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const suffix = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
  return `${safeBaseName(originalName)}-${now}-${suffix}.webp`;
}
