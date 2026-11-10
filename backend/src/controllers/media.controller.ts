import { Request, Response } from "express";

import MediaService, { InvalidImageError, MediaInUseError, uploadDirProblem } from "../services/media.service";
import { isObjectId, sanitizeText } from "../utils/validation";
import { sendError } from "../config/errors";

const MAX_ALT_LENGTH = 300;

class MediaController {

  static async list(req: Request, res: Response): Promise<Response> {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      return res.json(await MediaService.list(q));
    } catch (err) {
      console.error(err);
      return sendError(res, "UNKNOWN_ERROR");
    }
  }

  static async upload(req: Request, res: Response): Promise<Response> {
    if (!req.file) return sendError(res, "UPLOAD_ERROR", "No file uploaded");

    try {
      const media = await MediaService.upload(req.file.buffer, req.file.originalname, req.user?._id);
      return res.status(201).json(media);
    } catch (err) {
      if (err instanceof InvalidImageError) return sendError(res, "UPLOAD_ERROR", err.message);
      console.error("Upload failed:", err);
      // sharp reports write failures without an errno code, so check directly
      if (await uploadDirProblem()) {
        return sendError(res, "UNKNOWN_ERROR", "Server cannot write to the uploads folder (permissions). See the backend log.");
      }
      return sendError(res, "UNKNOWN_ERROR", "Error processing image");
    }
  }

  static async update(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    if (!isObjectId(id)) return sendError(res, "BAD_REQUEST", "Invalid media id");

    const { alt } = req.body ?? {};
    if (typeof alt !== "string" || alt.length > MAX_ALT_LENGTH) {
      return sendError(res, "INVALID_INPUT", `alt must be a string of at most ${MAX_ALT_LENGTH} characters`);
    }

    try {
      const media = await MediaService.updateAlt(id, sanitizeText(alt));
      if (!media) return sendError(res, "NOT_FOUND", "Media not found");
      return res.json(media);
    } catch (err) {
      console.error(err);
      return sendError(res, "UNKNOWN_ERROR");
    }
  }

  static async remove(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;
    if (!isObjectId(id)) return sendError(res, "BAD_REQUEST", "Invalid media id");

    try {
      const deleted = await MediaService.remove(id);
      if (!deleted) return sendError(res, "NOT_FOUND", "Media not found");
      return res.status(204).send();
    } catch (err) {
      if (err instanceof MediaInUseError) {
        return res.status(409).json({ error: err.message, usedIn: err.usedIn });
      }
      console.error(err);
      return sendError(res, "UNKNOWN_ERROR");
    }
  }
}

export default MediaController;
