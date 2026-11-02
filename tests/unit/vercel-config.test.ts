import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HSTS, IMMUTABLE_ASSET_CACHE, SECURITY_HEADERS } from "../../src/http/security-headers.js";

interface VercelConfig {
  outputDirectory: string;
  buildCommand: string;
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

const config: VercelConfig = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../vercel.json"), "utf8"),
);
const headersFor = (source: string) =>
  Object.fromEntries(
    (config.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]),
  );

describe("vercel.json (D-025: website on Vercel, API behind a /v1 rewrite)", () => {
  it("builds and serves the website", () => {
    expect(config.buildCommand).toBe("pnpm web:build");
    expect(config.outputDirectory).toBe("web/dist");
  });

  it("forwards /v1 to the API host before the website fallback", () => {
    expect(config.rewrites[0]?.source).toBe("/v1/:path*");
    expect(config.rewrites[0]?.destination).toMatch(/^https:\/\/[^/]+\/v1\/:path\*$/);
    expect(config.rewrites.at(-1)).toEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("sends exactly the server's security headers, plus HSTS", () => {
    expect(headersFor("/(.*)")).toEqual({ ...SECURITY_HEADERS, "strict-transport-security": HSTS });
  });

  it("never caches pages or API responses; caches hashed assets for good", () => {
    expect(headersFor("/((?!assets/).*)")).toEqual({ "cache-control": "no-store" });
    expect(headersFor("/assets/(.*)")).toEqual({ "cache-control": IMMUTABLE_ASSET_CACHE });
  });
});
