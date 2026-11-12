// Loaded by Jest before any test file (package.json "setupFiles"), so the
// configuration the app reads at import time is already in place.
import os from "os";
import path from "path";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-not-used-anywhere-else";
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `sd-test-uploads-${process.pid}`);
process.env.MEDIA_SYNC_ON_START = "false";
