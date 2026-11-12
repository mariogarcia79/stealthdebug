import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Purge expired entries every 5 minutes without blocking process exit
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

// name: each limiter counts separately (login attempts don't use up the
// sign-up allowance, and so on)
export function rateLimitAuth(windowMs: number, maxRequests: number, name = "auth") {
  return (req: Request, res: Response, next: NextFunction) => {
    // Route tests make many requests from one address
    if (process.env.NODE_ENV === "test") return next();
    const ip = `${name}:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
    const now = Date.now();

    const entry = store.get(ip);

    if (!entry || entry.resetAt < now) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    next();
  };
}
