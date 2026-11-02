/**
 * Security headers for every response, and for the website when Vercel serves it (D-025).
 * `vercel.json` must use exactly these values; a unit test checks it.
 */

/** Only Oruno's own scripts, styles and API. No inline scripts, no third-party code, no framing. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

/** Production only (HTTPS). */
export const HSTS = "max-age=31536000; includeSubDomains";

/** Hashed, immutable website files (Vite's `/assets`). */
export const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";
