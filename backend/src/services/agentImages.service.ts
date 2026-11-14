import { Types } from "mongoose";
import PendingImageModel, { IPendingImageDocument } from "../models/PendingImage";
import ChangeRequestModel, { IChangeRequest } from "../models/ChangeRequest";
import MediaModel from "../models/Media";
import MediaService, { cleanWebp, InvalidImageError } from "./media.service";
import { AppError } from "../config/errors";
import { extractUploadFilenames, newUploadFilename, uploadUrl } from "../utils/media";
import { fetchImage } from "../utils/safeFetch";

// Images agents upload for their proposals. They are re-encoded on arrival
// (cleanWebp: no metadata) and kept private until a change request that
// uses them is accepted; then they join the media library under the file
// name the proposal already references. Unused ones expire.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;     // downloaded file, before re-encoding
export const MAX_BASE64_BYTES = 6 * 1024 * 1024;     // base64 data (bodies are limited to 9 MB)
export const MAX_PENDING_PER_AGENT = 30;
export const PENDING_TTL_DAYS = 30;
const ACTIVE = ["open", "outdated", "declined"];

export interface AgentImageDTO {
  filename: string;
  url: string;          // what to put in the Markdown
  markdown: string;
  alt: string;
  width: number;
  height: number;
  size: number;
  createdAt: Date;
}

const toDTO = (d: IPendingImageDocument): AgentImageDTO => ({
  filename: d.filename,
  url: uploadUrl(d.filename),
  markdown: `![${d.alt.replace(/[[\]]/g, "")}](${uploadUrl(d.filename)})`,
  alt: d.alt,
  width: d.width,
  height: d.height,
  size: d.size,
  createdAt: d.createdAt,
});

// Every text of the current revision that would be published
export function proposalTexts(cr: Pick<IChangeRequest, "revisions">): string {
  const rev = cr.revisions[cr.revisions.length - 1];
  if (!rev) return "";
  return [rev.fields.content, rev.fields.summary, ...(rev.translations ?? []).flatMap((t) => [t.content, t.summary])]
    .filter(Boolean).join("\n");
}

class AgentImageService {
  static async upload(agentId: string, input: { data?: string; url?: string; filename?: string; alt?: string }): Promise<AgentImageDTO> {
    if (!!input.data === !!input.url) throw new AppError("INVALID_INPUT", "Give either data (base64) or url");
    const count = await PendingImageModel.countDocuments({ agent: agentId });
    if (count >= MAX_PENDING_PER_AGENT) throw new AppError("TOO_MANY_IMAGES");

    let raw: Buffer;
    if (input.data) {
      const b64 = input.data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new AppError("INVALID_INPUT", "data must be base64");
      if (b64.length * 0.75 > MAX_BASE64_BYTES) throw new AppError("INVALID_INPUT", "Image too large for base64 (6 MB at most): give a url instead");
      raw = Buffer.from(b64, "base64");
    } else {
      raw = await fetchImage(input.url!, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15000 });
    }

    let clean;
    try {
      clean = await cleanWebp(raw);
    } catch (err) {
      if (err instanceof InvalidImageError) throw new AppError("INVALID_INPUT", err.message);
      throw err;
    }
    const name = (input.filename || (input.url ? new URL(input.url).pathname.split("/").pop() : "") || "image").slice(0, 100);
    const doc = await PendingImageModel.create({
      agent: agentId,
      filename: newUploadFilename(name),
      originalName: name,
      alt: (input.alt ?? "").trim().slice(0, 300),
      width: clean.width,
      height: clean.height,
      size: clean.data.length,
      data: clean.data,
    });
    return toDTO(doc);
  }

  static async listOwn(agentId: string): Promise<AgentImageDTO[]> {
    const docs = await PendingImageModel.find({ agent: agentId }).select("-data").sort({ createdAt: -1 });
    return docs.map(toDTO);
  }

  // For the review screen: the agent's unpublished images a proposal uses
  static async forProposal(agentId: string, texts: string): Promise<AgentImageDTO[]> {
    const names = extractUploadFilenames(texts);
    if (!names.length) return [];
    const docs = await PendingImageModel.find({ agent: agentId, filename: { $in: names } }).select("-data");
    return docs.map(toDTO);
  }

  // The file, for the admin's review (never public)
  static async file(filename: string): Promise<Buffer | null> {
    const doc = await PendingImageModel.findOne({ filename }).select("data");
    return doc ? doc.data : null;
  }

  // On accept: the agent's pending images the accepted texts use become
  // library images (same file name). Returns how many were published.
  static async publishFor(agentId: string, texts: string): Promise<number> {
    const names = extractUploadFilenames(texts);
    if (!names.length) return 0;
    const docs = await PendingImageModel.find({ agent: agentId, filename: { $in: names } });
    let n = 0;
    for (const d of docs) {
      if (!(await MediaModel.exists({ filename: d.filename }))) {
        await MediaService.store({ data: d.data, width: d.width, height: d.height }, d.originalName || d.filename, d.filename,
          { uploadedBy: agentId, alt: d.alt });
        n++;
      }
      await d.deleteOne();
    }
    return n;
  }

  // Unpublished images older than the TTL that no active request of their
  // agent uses. Runs at start and daily.
  static async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_TTL_DAYS * 86400_000);
    const old = await PendingImageModel.find({ createdAt: { $lt: cutoff } }).select("agent filename");
    let removed = 0;
    for (const img of old) {
      const active = await ChangeRequestModel.find({ agent: img.agent, status: { $in: ACTIVE } }).select("revisions");
      if (active.some((cr) => extractUploadFilenames(proposalTexts(cr)).includes(img.filename))) continue;
      await img.deleteOne();
      removed++;
    }
    return removed;
  }

  // An agent removed: its unpublished images go too
  static async removeForAgent(agentId: string | Types.ObjectId): Promise<void> {
    await PendingImageModel.deleteMany({ agent: agentId });
  }
}

export default AgentImageService;
