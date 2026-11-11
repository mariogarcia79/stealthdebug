import { promises as fs, constants as fsConstants } from "fs";
import path from "path";
import sharp from "sharp";
import type { Metadata, Sharp, OutputInfo } from "sharp";
import { Types } from "mongoose";

import MediaModel, { IMediaDocument, IMediaVariant } from "../models/Media";
import PostModel from "../models/Post";
import {
  VARIANTS_DIRNAME,
  MAX_ORIGINAL_WIDTH,
  isSafeUploadName,
  variantWidthsFor,
  variantFilename,
  uploadUrl,
  variantUrl,
  extractUploadFilenames,
  contentReferences,
  newUploadFilename,
} from "../utils/media";

// Same directory the backend has always written to (mounted volume in prod).
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "public/uploads");
export const VARIANT_DIR = path.join(UPLOAD_DIR, VARIANTS_DIRNAME);

// Error message when the uploads folder (a volume) is not writable by this
// process, or null when it is. Checked at startup so the cause is obvious in
// the logs instead of every upload failing with a generic error.
export async function uploadDirProblem(): Promise<string | null> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.access(UPLOAD_DIR, fsConstants.W_OK);
    return null;
  } catch (err: any) {
    const uid = typeof process.getuid === "function" ? process.getuid() : "?";
    return `${UPLOAD_DIR} is not writable by uid ${uid} (${err?.code ?? err}). ` +
      "Uploads and resized copies will fail until the volume is owned by this user " +
      "(see RUNBOOK section 11, scripts/migrate-media.sh).";
  }
}

// Reject decompression bombs before decoding (width * height, all frames).
const MAX_INPUT_PIXELS = 40_000_000;
const SHARP_INPUT = { animated: true, limitInputPixels: MAX_INPUT_PIXELS } as const;

export class MediaInUseError extends Error {
  constructor(public usedIn: { _id: string; title: string }[]) {
    super("Media is used by one or more posts");
  }
}

export class InvalidImageError extends Error {}

export interface PostUsage {
  _id: string;
  title: string;
  published: boolean;
}

export interface MediaDTO {
  _id: string;
  filename: string;
  url: string;
  thumbUrl: string;
  originalName: string;
  alt: string;
  width: number;
  height: number;
  size: number;
  variants: { width: number; height: number; url: string; size: number }[];
  createdAt: Date;
  usedIn: PostUsage[];
}

// What a rendered post needs to build <img srcset>, keyed by filename.
export interface PostImageInfo {
  width: number;
  height: number;
  variants: { width: number; url: string }[];
}

function originalPath(filename: string): string {
  if (!isSafeUploadName(filename)) throw new Error(`Unsafe upload filename: ${filename}`);
  return path.join(UPLOAD_DIR, filename);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Height of one frame (animated images report the full strip as height).
function frameHeight(meta: Metadata): number {
  return meta.pageHeight || meta.height || 0;
}

// Writes to a temp file and renames, so a crash never leaves a half-written
// file under a name that is cached for a year.
async function writeWebp(pipeline: Sharp, dest: string, quality: number): Promise<OutputInfo> {
  const tmp = `${dest}.tmp-${process.pid}`;
  try {
    const info = await pipeline.webp({ quality, effort: 4 }).toFile(tmp);
    await fs.rename(tmp, dest);
    return info;
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

// Creates any missing resized copies of an original. Existing copies are kept.
async function ensureVariants(filename: string, width: number, height: number): Promise<IMediaVariant[]> {
  await fs.mkdir(VARIANT_DIR, { recursive: true });
  const variants: IMediaVariant[] = [];

  for (const w of variantWidthsFor(width)) {
    const file = variantFilename(filename, w);
    const dest = path.join(VARIANT_DIR, file);
    if (!(await exists(dest))) {
      await writeWebp(sharp(originalPath(filename), SHARP_INPUT).resize({ width: w }), dest, 80);
    }
    const { size } = await fs.stat(dest);
    variants.push({ width: w, height: Math.round((height * w) / width), filename: file, size });
  }
  return variants;
}

async function removeFiles(filename: string, variants: IMediaVariant[]): Promise<void> {
  for (const v of variants) {
    if (isSafeUploadName(v.filename)) {
      await fs.rm(path.join(VARIANT_DIR, v.filename), { force: true });
    }
  }
  await fs.rm(originalPath(filename), { force: true });
}

async function allPostUsage(): Promise<{ _id: string; title: string; published: boolean; content: string }[]> {
  const posts = await PostModel.find({}, { title: 1, content: 1, published: 1 }).lean();
  return posts.map((p) => ({
    _id: String(p._id),
    title: p.title,
    published: p.published,
    content: p.content || "",
  }));
}

function toDTO(doc: IMediaDocument, posts: Awaited<ReturnType<typeof allPostUsage>>): MediaDTO {
  const variants = [...doc.variants].sort((a, b) => a.width - b.width);
  return {
    _id: String(doc._id),
    filename: doc.filename,
    url: uploadUrl(doc.filename),
    thumbUrl: variants.length ? variantUrl(variants[0].filename) : uploadUrl(doc.filename),
    originalName: doc.originalName,
    alt: doc.alt,
    width: doc.width,
    height: doc.height,
    size: doc.size,
    variants: variants.map((v) => ({ width: v.width, height: v.height, url: variantUrl(v.filename), size: v.size })),
    createdAt: doc.createdAt,
    usedIn: posts
      .filter((p) => contentReferences(p.content, doc.filename))
      .map(({ _id, title, published }) => ({ _id, title, published })),
  };
}

class MediaService {
  // Stores an uploaded image as WebP (max MAX_ORIGINAL_WIDTH wide) plus its
  // resized copies, and records it in the library.
  static async upload(buffer: Buffer, originalName: string, userId?: string): Promise<MediaDTO> {
    let meta: Metadata;
    try {
      meta = await sharp(buffer, SHARP_INPUT).metadata();
    } catch {
      throw new InvalidImageError("Invalid or too large image");
    }
    if (!meta.width || !frameHeight(meta) || !meta.format) {
      throw new InvalidImageError("Invalid image");
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filename = newUploadFilename(originalName);
    const dest = originalPath(filename);

    let variants: IMediaVariant[] = [];
    try {
      const info = await writeWebp(
        sharp(buffer, SHARP_INPUT).rotate().resize({ width: MAX_ORIGINAL_WIDTH, withoutEnlargement: true }),
        dest,
        82
      );
      const saved = await sharp(dest, SHARP_INPUT).metadata();
      const width = saved.width || info.width;
      const height = frameHeight(saved) || info.height;

      variants = await ensureVariants(filename, width, height);

      const doc = await MediaModel.create({
        filename,
        originalName: originalName.slice(0, 200),
        width,
        height,
        size: info.size,
        variants,
        uploadedBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
      });
      return toDTO(doc, []);
    } catch (err) {
      await removeFiles(filename, variants).catch(() => undefined);
      throw err;
    }
  }

  static async list(q?: string): Promise<MediaDTO[]> {
    const filter: Record<string, unknown> = {};
    if (q && q.trim()) {
      const escaped = q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      filter.$or = [{ filename: re }, { originalName: re }, { alt: re }];
    }
    const [docs, posts] = await Promise.all([
      MediaModel.find(filter).sort({ createdAt: -1 }).limit(500),
      allPostUsage(),
    ]);
    return docs.map((d) => toDTO(d, posts));
  }

  static async updateAlt(id: string, alt: string): Promise<MediaDTO | null> {
    const doc = await MediaModel.findByIdAndUpdate(id, { alt }, { new: true });
    if (!doc) return null;
    return toDTO(doc, await allPostUsage());
  }

  // Deletes the files and the record, unless any post (published or not)
  // still references the image.
  static async remove(id: string): Promise<boolean> {
    const doc = await MediaModel.findById(id);
    if (!doc) return false;

    const usedIn = (await allPostUsage()).filter((p) => contentReferences(p.content, doc.filename));
    if (usedIn.length) {
      throw new MediaInUseError(usedIn.map(({ _id, title }) => ({ _id, title })));
    }

    await removeFiles(doc.filename, doc.variants);
    await doc.deleteOne();
    return true;
  }

  // Size data for the images a post references, keyed by filename.
  static async imagesForContent(content: string): Promise<Record<string, PostImageInfo>> {
    return MediaService.imagesByFilename(extractUploadFilenames(content));
  }

  static async imagesByFilename(names: string[]): Promise<Record<string, PostImageInfo>> {
    if (!names.length) return {};
    const docs = await MediaModel.find({ filename: { $in: names } }).lean();
    const out: Record<string, PostImageInfo> = {};
    for (const d of docs) {
      out[d.filename] = {
        width: d.width,
        height: d.height,
        variants: [...d.variants]
          .sort((a, b) => a.width - b.width)
          .map((v) => ({ width: v.width, url: variantUrl(v.filename) })),
      };
    }
    return out;
  }

  // Makes the library match the files on disk. Adds a record and resized
  // copies for every original that lacks them. Never deletes or modifies an
  // original file, and never touches posts, comments or users. Safe to run
  // on every start.
  static async syncLibrary(): Promise<{ scanned: number; created: number; updated: number; failed: number }> {
    const stats = { scanned: 0, created: 0, updated: 0, failed: 0 };

    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === "ENOENT") return stats;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !isSafeUploadName(entry.name)) continue;
      stats.scanned++;
      const filename = entry.name;

      try {
        const meta = await sharp(originalPath(filename), SHARP_INPUT).metadata();
        const width = meta.width || 0;
        const height = frameHeight(meta);
        if (!width || !height) throw new Error("unreadable dimensions");

        const variants = await ensureVariants(filename, width, height);
        const { size } = await fs.stat(originalPath(filename));
        const existing = await MediaModel.findOne({ filename });

        if (!existing) {
          await MediaModel.create({ filename, originalName: filename, width, height, size, variants });
          stats.created++;
        } else {
          const sameVariants =
            existing.variants.length === variants.length &&
            existing.variants.every((v, i) => v.filename === variants[i].filename && v.size === variants[i].size);
          if (!sameVariants || existing.width !== width || existing.height !== height || existing.size !== size) {
            existing.set({ width, height, size, variants });
            await existing.save();
            stats.updated++;
          }
        }
      } catch (err) {
        stats.failed++;
        console.error(`Media sync: skipped ${filename}:`, (err as Error).message);
      }
    }
    return stats;
  }
}

export default MediaService;
