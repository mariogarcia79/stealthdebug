/* Removes metadata (EXIF incl. GPS, XMP, IPTC, ICC profiles, PNG text
   chunks, comments) from the images already in the uploads volume.

   Images uploaded through the current pipeline are already clean (WebP
   re-encoded by sharp, which keeps no metadata); this is for older files.

   Dry run by default: lists what it finds and changes nothing.
     node dist/scripts/stripMetadata.js                 # report
     node dist/scripts/stripMetadata.js --apply         # clean in place
     node dist/scripts/stripMetadata.js --apply --backup-dir /path/outside/uploads

   Each file keeps its name (posts link to it) and its format. The EXIF
   orientation is applied to the pixels before it is dropped, so photos
   don't turn sideways. Resized copies of a cleaned image are regenerated
   and its library record updated. JPEG is re-encoded at quality 92, PNG
   and GIF losslessly, WebP at quality 90.

   --backup-dir must NOT be inside the uploads directory: nginx serves that
   directory, so the backups (with their metadata) would be public. */
import { promises as fs } from "fs";
import path from "path";
import sharp, { type Metadata } from "sharp";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import MediaModel from "../models/Media";
import { UPLOAD_DIR, VARIANT_DIR } from "../services/media.service";
import { isSafeUploadName, variantWidthsFor, variantFilename } from "../utils/media";

const SHARP_INPUT = { animated: true, limitInputPixels: 40_000_000 } as const;

export function metadataFound(m: Metadata): string[] {
  const found: string[] = [];
  if (m.exif) found.push("EXIF");
  if (m.xmp) found.push("XMP");
  if (m.iptc) found.push("IPTC");
  if (m.icc) found.push("ICC");
  if (m.comments?.length) found.push("comments");
  if ((m as Metadata & { tifftagPhotoshop?: Buffer }).tifftagPhotoshop) found.push("Photoshop");
  if (m.orientation && m.orientation !== 1) found.push(`orientation ${m.orientation}`);
  return found;
}

export async function cleanBuffer(input: Buffer, format: string): Promise<Buffer> {
  const p = sharp(input, SHARP_INPUT).rotate();
  switch (format) {
    case "jpeg": return p.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    case "png":  return p.png({ compressionLevel: 9 }).toBuffer();
    case "gif":  return p.gif().toBuffer();
    case "webp": return p.webp({ quality: 90 }).toBuffer();
    default: throw new Error(`unsupported format ${format}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const bi = args.indexOf("--backup-dir");
  const backupDir = bi >= 0 ? path.resolve(args[bi + 1] ?? "") : null;
  if (backupDir && (backupDir + path.sep).startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    console.error("--backup-dir must be outside the uploads directory (it is served publicly)");
    process.exit(2);
  }
  if (backupDir) await fs.mkdir(backupDir, { recursive: true });

  const stats = { scanned: 0, withMetadata: 0, cleaned: 0, failed: 0, variantsWithMetadata: 0 };
  const files = (await fs.readdir(UPLOAD_DIR, { withFileTypes: true })).filter((e) => e.isFile() && isSafeUploadName(e.name));
  if (apply) await connectDB();

  for (const f of files) {
    stats.scanned++;
    const file = path.join(UPLOAD_DIR, f.name);
    try {
      const input = await fs.readFile(file);
      const meta = await sharp(input, SHARP_INPUT).metadata();
      const found = metadataFound(meta);
      if (!found.length) continue;
      stats.withMetadata++;
      console.log(`${apply ? "cleaning" : "found"}  ${f.name}: ${found.join(", ")}`);
      if (!apply) continue;

      if (backupDir) await fs.copyFile(file, path.join(backupDir, f.name));
      const out = await cleanBuffer(input, meta.format ?? "");
      const left = metadataFound(await sharp(out, SHARP_INPUT).metadata());
      if (left.length) throw new Error(`still has ${left.join(", ")}`);
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, out);
      await fs.rename(tmp, file);

      // Orientation may have swapped width and height: rebuild the copies
      const m = await sharp(out, SHARP_INPUT).metadata();
      const width = m.width ?? 0, height = m.pageHeight || m.height || 0;
      const doc = await MediaModel.findOne({ filename: f.name });
      for (const v of doc?.variants ?? []) if (isSafeUploadName(v.filename)) await fs.rm(path.join(VARIANT_DIR, v.filename), { force: true });
      const variants = [];
      for (const w of variantWidthsFor(width)) {
        const name = variantFilename(f.name, w);
        const dest = path.join(VARIANT_DIR, name);
        await fs.rm(dest, { force: true });
        const info = await sharp(out, SHARP_INPUT).resize({ width: w }).webp({ quality: 80, effort: 4 }).toFile(dest);
        variants.push({ width: w, height: Math.round((height * w) / width), filename: name, size: info.size });
      }
      if (doc) { doc.set({ width, height, size: out.length, variants }); await doc.save(); }
      stats.cleaned++;
    } catch (err) {
      stats.failed++;
      console.error(`failed  ${f.name}: ${(err as Error).message}`);
    }
  }

  // Resized copies are made by sharp and should never carry metadata: check
  try {
    for (const v of await fs.readdir(VARIANT_DIR)) {
      if (!isSafeUploadName(v)) continue;
      const m = await sharp(path.join(VARIANT_DIR, v), SHARP_INPUT).metadata();
      if (metadataFound(m).length) { stats.variantsWithMetadata++; console.log(`variant with metadata: ${v}`); }
    }
  } catch { /* no variants directory */ }

  console.log(JSON.stringify(stats));
  if (!apply && stats.withMetadata) console.log("Dry run: nothing changed. Run again with --apply to clean these files.");
  if (apply) await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
