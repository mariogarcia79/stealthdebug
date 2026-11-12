import { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError, sendError } from "../config/errors";

// Express 4 doesn't catch rejected promises from async handlers: wrap them so
// a thrown error reaches errorHandler instead of hanging the request.
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

// Unknown /api routes: JSON 404 (instead of Express's HTML page).
export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, "NOT_FOUND");
}

// The one place errors become responses. Known errors (AppError and its
// subclasses) keep their status and message; body-parser problems are 4xx;
// everything else is logged and answered with a generic 500, so no internal
// message (database, stack, library) ever reaches the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, ...(err.details ?? {}) });
    return;
  }

  const type = (err as { type?: string })?.type;
  if (type === "entity.parse.failed") { sendError(res, "INVALID_JSON"); return; }
  if (type === "entity.too.large")    { sendError(res, "PAYLOAD_TOO_LARGE"); return; }

  console.error(`Error: ${req.method} ${req.originalUrl}:`, err);
  sendError(res, "UNKNOWN_ERROR");
}
