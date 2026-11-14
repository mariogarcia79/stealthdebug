import https from "https";
import dns from "dns";
import net from "net";
import { AppError } from "../config/errors";

// Downloads an image an agent points to by URL, without letting that URL
// reach this server's own network (SSRF): https only, port 443, no
// credentials in the URL, every resolved address must be public (checked
// when connecting, so DNS rebinding can't swap it afterwards), no
// redirects, size and time limits.

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const V6_BLOCKED: [string, number][] = [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
];
const blocked = new net.BlockList();
for (const [a, p] of V4_BLOCKED) blocked.addSubnet(a, p, "ipv4");
for (const [a, p] of V6_BLOCKED) blocked.addSubnet(a, p, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d, also written ::ffff:7f00:1): judge the IPv4
    const mapped = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(address);
    if (mapped) {
      const tail = mapped[1];
      if (net.isIPv4(tail)) return isPublicAddress(tail);
      const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
      if (m) {
        const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
        return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
      return false;
    }
  }
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

// dns.lookup that fails unless every address is public
function publicLookup(host: string, options: dns.LookupOptions, cb: LookupCb): void {
  dns.lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return cb(Object.assign(new Error("address not allowed"), { code: "EADDRNOTALLOWED" }), "");
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export function checkImageUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError("INVALID_INPUT", "url is not a valid URL"); }
  if (url.protocol !== "https:") throw new AppError("INVALID_INPUT", "Only https URLs are accepted");
  if (url.username || url.password) throw new AppError("INVALID_INPUT", "URLs with credentials are not accepted");
  if (url.port && url.port !== "443") throw new AppError("INVALID_INPUT", "Only the default https port is accepted");
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new AppError("INVALID_INPUT", "That address is not allowed");
  }
  return url;
}

export function fetchImage(raw: string, opts: { maxBytes: number; timeoutMs: number }): Promise<Buffer> {
  const url = checkImageUrl(raw);
  return new Promise((resolve, reject) => {
    const fail = (msg: string) => reject(new AppError("INVALID_INPUT", `Could not download the image: ${msg}`));
    const req = https.get(url, {
      lookup: publicLookup as unknown as typeof dns.lookup,
      headers: { "User-Agent": "stealthdebug-image-fetch/1.0", Accept: "image/*" },
      timeout: opts.timeoutMs,
    }, (res) => {
      if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
        res.resume();
        return fail("redirects are not followed; give the final address of the image");
      }
      if (res.statusCode !== 200) { res.resume(); return fail(`HTTP ${res.statusCode}`); }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > opts.maxBytes) { res.destroy(); return fail("too large"); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBytes) { res.destroy(); fail("too large"); return; }
        chunks.push(c);
      });
      res.on("end", () => { if (size <= opts.maxBytes) resolve(Buffer.concat(chunks)); });
      res.on("error", () => fail("connection error"));
    });
    const timer = setTimeout(() => { req.destroy(); fail("timed out"); }, opts.timeoutMs);
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => { req.destroy(); fail("timed out"); });
    req.on("error", (e: NodeJS.ErrnoException) => fail(e.code === "EADDRNOTALLOWED" ? "that address is not allowed" : "connection failed"));
  });
}
