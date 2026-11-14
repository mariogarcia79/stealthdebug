import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import routes from "./routes/index";
import compression from "compression";
import { errorHandler } from "./middleware/error.middleware";
import OAuthController from "./controllers/oauth.controller";

const app = express();

// One proxy (nginx) in front: req.ip is the X-Forwarded-For nginx sets, which
// is exactly the visitor IP from Cloudflare (used by the login rate limiter).
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false })); // CSP is enforced at the nginx layer
app.use(compression());
// Agents' image uploads carry base64 (checked again by the service)
app.use("/api/agent/images", express.json({ limit: "9mb" }));
app.use(express.json());
app.use(cookieParser());
// OAuth authorization server metadata (RFC 8414) lives at the site's root,
// where clients look for it for the issuer https://stealthdebug.org
app.get("/.well-known/oauth-authorization-server", OAuthController.metadata);
app.use("/api", routes);

// Must come last: turns every thrown/forwarded error into a JSON response
app.use(errorHandler);

export default app;