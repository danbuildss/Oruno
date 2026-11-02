import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { FakeGitHub } from "../helpers/fake-github.js";
import { NOW } from "../helpers/seed.js";

/** Sign-in start is limited to 20 requests per minute per client IP. */
async function hit(app: FastifyInstance, remoteAddress: string, forwardedFor?: string) {
  const res = await app.inject({
    method: "GET",
    url: "/v1/auth/github/start",
    remoteAddress,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
  return res.statusCode;
}

describe("client IP behind proxies (TRUST_PROXY, D-025)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("without TRUST_PROXY, a forged X-Forwarded-For can't escape the limit", async () => {
    const { app } = await testApp(db, { github: new FakeGitHub(), clock: () => NOW });
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push(await hit(app, "203.0.113.9", `198.51.100.${i}`));
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
    await app.close();
  });

  it("with one trusted hop, each real client behind the proxy gets its own limit", async () => {
    const { app } = await testApp(db, {
      github: new FakeGitHub(),
      clock: () => NOW,
      trustProxy: 1,
    });
    const proxy = "10.1.2.3";
    for (let i = 0; i < 20; i++) expect(await hit(app, proxy, "198.51.100.1")).toBe(200);
    expect(await hit(app, proxy, "198.51.100.1")).toBe(429);
    // A different person behind the same proxy is unaffected.
    expect(await hit(app, proxy, "198.51.100.2")).toBe(200);
    // A client prepending a fake address doesn't change which address is used (the proxy's
    // own entry, the last one, is the client it saw).
    expect(await hit(app, proxy, "1.2.3.4, 198.51.100.1")).toBe(429);
    await app.close();
  });
});
