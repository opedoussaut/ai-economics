/**
 * Minimal admin session for the private monitoring area.
 * Cookie value: "<expiryMs>.<base64url HMAC-SHA256(SESSION_SECRET, expiryMs)>".
 * Uses Web Crypto so it runs in both the Edge middleware and Node routes.
 */
export const SESSION_COOKIE = "aie_session";
export const SESSION_TTL_MS = 12 * 3600 * 1000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export const authConfigured = () => !!process.env.ADMIN_TOKEN && (process.env.SESSION_SECRET?.length ?? 0) >= 32;

export async function createSessionToken(secret: string, now = Date.now()) {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

export function bearerOk(header: string | null, expected: string | undefined) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), expected);
}
