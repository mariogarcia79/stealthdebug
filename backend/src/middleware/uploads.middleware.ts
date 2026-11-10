import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { sendError } from "../config/errors";

// Receives a single image into memory; MediaService validates, converts and
// stores it.

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);

function isAsciiOnly(str: string) {
  return /^[\x00-\x7F]+$/.test(str);
}

const receiveSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter: (_, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) return cb(new Error("Invalid file type"));
    if (!isAsciiOnly(file.originalname)) return cb(new Error("Filename must be ASCII"));
    if (file.originalname.includes("..") || file.originalname.includes("/") || file.originalname.includes("\\")) {
      return cb(new Error("Invalid filename"));
    }
    cb(null, true);
  },
}).single("file");

// Wraps multer so its errors become 400 JSON responses instead of reaching
// Express's default (HTML, 500) error handler.
export function upload(req: Request, res: Response, next: NextFunction) {
  receiveSingle(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "File too large (max 10 MB)"
        : err instanceof Error
          ? err.message
          : "Upload error";
    return sendError(res, "UPLOAD_ERROR", message);
  });
}
