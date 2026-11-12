// Loaded by Jest before any test file (package.json "setupFiles"), so the
// configuration the app reads at import time is already in place.
import os from "os";
import path from "path";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-jwt-secret-not-used-anywhere-else";
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `sd-test-uploads-${process.pid}`);
process.env.MEDIA_SYNC_ON_START = "false";

// Service credential of the MCP server (agent API): a throwaway key pair
import { generateKeyPairSync } from "crypto";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
process.env.AGENT_API_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
process.env.TEST_AGENT_API_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.MAX_OPEN_CHANGE_REQUESTS = "3";

// Access-token signing key of the authorization server
const oauth = generateKeyPairSync("ed25519");
process.env.OAUTH_SIGNING_KEY = oauth.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.TEST_OAUTH_PUBLIC_KEY = oauth.publicKey.export({ type: "spki", format: "pem" }).toString();
process.env.OAUTH_ISSUER = "https://stealthdebug.test";
process.env.MCP_RESOURCE = "https://mcp.stealthdebug.test/mcp";
