import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import routes from "./routes/index";
import compression from "compression";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

// One proxy (nginx) in front: req.ip is the X-Forwarded-For nginx sets, which
// is exactly the visitor IP from Cloudflare (used by the login rate limiter).
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false })); // CSP is enforced at the nginx layer
app.use(compression());
app.use(express.json());
app.use(cookieParser());
app.use("/api", routes);

// Must come last: turns every thrown/forwarded error into a JSON response
app.use(errorHandler);

export default app;