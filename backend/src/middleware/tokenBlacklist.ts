const blacklist = new Map<string, number>(); // JWT signature → expiry (Unix seconds)

export function blacklistToken(token: string, expiry: number): void {
  const sig = token.split(".")[2];
  if (sig) blacklist.set(sig, expiry);
}

export function isTokenBlacklisted(token: string): boolean {
  const sig = token.split(".")[2];
  if (!sig) return false;
  const exp = blacklist.get(sig);
  if (exp === undefined) return false;
  if (Math.floor(Date.now() / 1000) > exp) {
    blacklist.delete(sig);
    return false;
  }
  return true;
}

// Purge expired entries every 10 minutes without blocking process exit
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [sig, exp] of blacklist) {
    if (now > exp) blacklist.delete(sig);
  }
}, 10 * 60 * 1000).unref();
