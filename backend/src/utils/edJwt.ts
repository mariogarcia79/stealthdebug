import { createPrivateKey, createPublicKey, sign, verify, KeyObject } from "crypto";

// Minimal JWT (RFC 7519) with EdDSA / Ed25519 only, on Node's crypto. Used for
// tokens between our own services, so it accepts exactly one algorithm and
// checks iss, aud, exp and the maximum lifetime itself.

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export interface JwtClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  [claim: string]: unknown;
}

export class JwtError extends Error {}

// PEM from an environment variable may have its newlines written as "\n"
export function readKey(pem: string, kind: "private" | "public"): KeyObject {
  const text = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const key = kind === "private" ? createPrivateKey(text) : createPublicKey(text);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("key must be Ed25519");
  return key;
}

// typ: "JWT", or "at+jwt" for OAuth access tokens (RFC 9068)
export function signJwt(claims: Omit<JwtClaims, "iat" | "exp">, key: KeyObject, ttlSeconds: number, typ = "JWT"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "EdDSA", typ }));
  const body = b64u(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds }));
  const sig = sign(null, Buffer.from(`${header}.${body}`), key);
  return `${header}.${body}.${b64u(sig)}`;
}

export function verifyJwt(
  token: string,
  key: KeyObject,
  expected: { iss: string; aud: string; maxLifetime: number; typ?: string }
): JwtClaims {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) throw new JwtError("malformed");
  const [h, b, s] = parts;

  let header: { alg?: unknown; crit?: unknown; typ?: unknown };
  try { header = JSON.parse(Buffer.from(h, "base64url").toString()); } catch { throw new JwtError("malformed"); }
  if (header.alg !== "EdDSA" || header.crit !== undefined) throw new JwtError("bad header");
  if (expected.typ && header.typ !== expected.typ) throw new JwtError("bad typ");

  if (!verify(null, Buffer.from(`${h}.${b}`), key, Buffer.from(s, "base64url"))) throw new JwtError("bad signature");

  let c: JwtClaims;
  try { c = JSON.parse(Buffer.from(b, "base64url").toString()); } catch { throw new JwtError("malformed"); }
  const now = Math.floor(Date.now() / 1000);
  if (c.iss !== expected.iss) throw new JwtError("bad iss");
  if (Array.isArray(c.aud) ? !c.aud.includes(expected.aud) : c.aud !== expected.aud) throw new JwtError("bad aud");
  if (typeof c.exp !== "number" || typeof c.iat !== "number") throw new JwtError("no exp/iat");
  if (c.exp <= now) throw new JwtError("expired");
  if (c.iat > now + 30 || c.exp - c.iat > expected.maxLifetime) throw new JwtError("bad lifetime");
  if (typeof c.sub !== "string") throw new JwtError("no sub");
  return c;
}
