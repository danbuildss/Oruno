import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url (43 characters). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** PKCE S256 challenge: BASE64URL(SHA256(verifier)) without padding (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}
