import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { FakeProvider } from "../../src/providers/fake.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { FakeGitHub, githubProfile } from "../helpers/fake-github.js";
import { claimBody, NOW, seedClaimer, seedDrop, seedOperator } from "../helpers/seed.js";

const HTML = { accept: "text/html,application/xhtml+xml" };

/** Runs browser sign-in: start → (GitHub approves) → callback. Returns the cookie set. */
async function browserSignIn(
  app: FastifyInstance,
  github: FakeGitHub,
  profile: ReturnType<typeof githubProfile>,
  drop?: string,
) {
  const start = await app.inject({
    method: "GET",
    url: `/v1/auth/github/start${drop ? `?drop=${drop}` : ""}`,
    headers: HTML,
  });
  expect(start.statusCode).toBe(303);
  const authorizeUrl = new URL(start.headers.location as string);
  const state = authorizeUrl.searchParams.get("state") ?? "";
  const returnCookie = start.cookies.find((c) => c.name === "oruno_return");
  const code = github.approve(state, profile);
  const callback = await app.inject({
    method: "GET",
    url: `/v1/auth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    headers: {
      ...HTML,
      ...(returnCookie ? { cookie: `oruno_return=${returnCookie.value}` } : {}),
    },
  });
  return { start, callback, state, returnCookie };
}

describe("claim website support (D-023)", () => {
  let db: Db;
  let github: FakeGitHub;

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    github = new FakeGitHub();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("browser sign-in redirects to GitHub, then sets an HttpOnly session cookie and returns to the pool", async () => {
    const { app, logs } = await testApp(db, { github, clock: () => NOW });
    const { start, callback, returnCookie } = await browserSignIn(
      app,
      github,
      githubProfile({ now: NOW }),
      "pool-1",
    );
    expect(start.headers.location).toMatch(/^https:\/\/github\.test\/login\/oauth\/authorize/);
    expect(returnCookie?.value).toBe("pool-1");

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe("/p/pool-1");
    const session = callback.cookies.find((c) => c.name === "oruno_session");
    expect(session?.value).toMatch(/^oru_cs_/);
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(session?.secure).toBeFalsy();
    // The token is only in the Set-Cookie header, never in the body or the logs.
    expect(callback.body).not.toContain(session?.value ?? "x");
    expect(logs.text).not.toContain(session?.value ?? "x");

    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { oruno_session: session?.value ?? "" },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ provider: "github" });
    await app.close();
  });

  it("uses a Secure __Host- cookie in production", async () => {
    const { app } = await testApp(db, { github, clock: () => NOW, secureCookies: true });
    const { callback } = await browserSignIn(app, github, githubProfile({ now: NOW }));
    expect(callback.headers.location).toBe("/credit");
    const session = callback.cookies.find((c) => c.name === "__Host-oruno_session");
    expect(session).toMatchObject({ httpOnly: true, secure: true, path: "/", sameSite: "Lax" });
    expect(session?.domain).toBeUndefined();
    expect(callback.headers["strict-transport-security"]).toContain("max-age=");
    // The development cookie name is not accepted in production.
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { oruno_session: session?.value ?? "" },
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("sends a browser back to the pool page with an error code when sign-in fails", async () => {
    const { app } = await testApp(db, { github, clock: () => NOW });
    const { state, returnCookie } = await browserSignIn(
      app,
      github,
      githubProfile({ now: NOW }),
      "pool-1",
    );
    // Replay: the state was already used.
    const code2 = github.approve(state, githubProfile({ now: NOW }));
    const replay = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?code=${code2}&state=${state}`,
      headers: { ...HTML, cookie: `oruno_return=${returnCookie?.value}` },
    });
    expect(replay.statusCode).toBe(303);
    expect(replay.headers.location).toBe("/p/pool-1?error=invalid_state");
    expect(replay.cookies.find((c) => c.name === "oruno_session")).toBeUndefined();

    // The person pressed "Cancel" on GitHub.
    const cancelled = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?error=access_denied&state=${state}`,
      headers: HTML,
    });
    expect(cancelled.headers.location).toBe("/credit?error=github_denied");
    // A tampered return cookie can't redirect anywhere else.
    const tampered = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?error=access_denied&state=${state}`,
      headers: { ...HTML, cookie: "oruno_return=https://evil.example" },
    });
    expect(tampered.headers.location).toBe("/credit?error=github_denied");
    // API clients still get JSON errors.
    const api = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?error=access_denied&state=${state}`,
    });
    expect(api.statusCode).toBe(400);
    expect(api.json().error.code).toBe("github_denied");
    await app.close();
  });

  it("refuses a cookie-authenticated state change without the CSRF header", async () => {
    const operator = await seedOperator(db);
    await seedDrop(db, operator.id, { slug: "pool-1" });
    const claimer = await seedClaimer(db);
    const { app } = await testApp(db, { clock: () => NOW, provider: new FakeProvider() });
    const cookies = { oruno_session: claimer.token };

    const forged = await app.inject({
      method: "POST",
      url: "/v1/drops/pool-1/claims",
      cookies,
      payload: claimBody(),
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json().error.code).toBe("csrf_check_failed");
    expect(await db.selectFrom("claims").select("id").execute()).toHaveLength(0);

    const wrongValue = await app.inject({
      method: "POST",
      url: "/v1/drops/pool-1/claims",
      cookies,
      headers: { "x-requested-with": "XMLHttpRequest" },
      payload: claimBody(),
    });
    expect(wrongValue.statusCode).toBe(403);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/drops/pool-1/claims",
      cookies,
      headers: { "x-requested-with": "oruno" },
      payload: claimBody(),
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.headers["cache-control"]).toBe("no-store");

    // Bearer tokens (API clients) don't need the header: they can't be sent by another site.
    const signOutBearer = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: { authorization: `Bearer ${claimer.token}` },
    });
    expect(signOutBearer.statusCode).toBe(204);
    await app.close();
  });

  it("sign-out with the cookie clears it and ends the session", async () => {
    const claimer = await seedClaimer(db);
    const { app } = await testApp(db, { clock: () => NOW });
    const out = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      cookies: { oruno_session: claimer.token },
      headers: { "x-requested-with": "oruno" },
    });
    expect(out.statusCode).toBe(204);
    const cleared = out.cookies.find((c) => c.name === "oruno_session");
    expect(cleared?.value).toBe("");
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { oruno_session: claimer.token },
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it("eligibility check: eligible, not eligible, already claimed, and pool problems", async () => {
    const operator = await seedOperator(db);
    await seedDrop(db, operator.id, { slug: "pool-1", maxClaims: 1 });
    const fresh = await seedClaimer(db, { ageDays: 3, publicRepos: 0, contributions: 0 });
    const good = await seedClaimer(db);
    const late = await seedClaimer(db);
    const { app } = await testApp(db, { clock: () => NOW, provider: new FakeProvider() });
    const check = (token: string, slug = "pool-1") =>
      app.inject({
        method: "GET",
        url: `/v1/drops/${slug}/eligibility`,
        headers: { authorization: `Bearer ${token}` },
      });

    const no = (await check(fresh.token)).json();
    expect(no).toMatchObject({ eligible: false, problem: null, claim: null });
    expect(no.reasons).toEqual(["account_too_new", "not_enough_activity"]);

    expect((await check(good.token)).json()).toMatchObject({
      eligible: true,
      reasons: [],
      problem: null,
      claim: null,
    });
    const claimed = await app.inject({
      method: "POST",
      url: "/v1/drops/pool-1/claims",
      headers: { authorization: `Bearer ${good.token}` },
      payload: claimBody(),
    });
    expect(claimed.statusCode).toBe(201);
    const after = (await check(good.token)).json();
    expect(after.claim).toMatchObject({ status: "active", spentMicro: "0" });
    // The secret is never part of the eligibility answer.
    expect(JSON.stringify(after)).not.toContain(claimed.json().key.secret);

    expect((await check(late.token)).json()).toMatchObject({
      eligible: true,
      problem: "drop_full",
    });
    expect((await check(late.token, "no-such-pool")).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/v1/drops/pool-1/eligibility" })).statusCode,
    ).toBe(401);
    await app.close();
  });

  it("my claims include the pool's name and slug and replacements left", async () => {
    const operator = await seedOperator(db);
    await seedDrop(db, operator.id, { slug: "pool-1", name: "Dan's AI pool" });
    const claimer = await seedClaimer(db);
    const { app } = await testApp(db, { clock: () => NOW, provider: new FakeProvider() });
    const auth = { authorization: `Bearer ${claimer.token}` };
    await app.inject({
      method: "POST",
      url: "/v1/drops/pool-1/claims",
      headers: auth,
      payload: claimBody(),
    });
    const mine = (await app.inject({ method: "GET", url: "/v1/me/claims", headers: auth })).json();
    expect(mine.claims[0]).toMatchObject({
      status: "active",
      drop: { slug: "pool-1", name: "Dan's AI pool" },
      secretDelivered: true,
      rotationsLeft: 3,
    });
    await app.close();
  });

  it("serves the website: files, SPA fallback for pages, JSON 404 for the API, security headers", async () => {
    const dist = mkdtempSync(join(tmpdir(), "oruno-web-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>Oruno</title>");
    writeFileSync(join(dist, "assets", "app-abc123.js"), "console.log(1)");
    const { app } = await testApp(db, { clock: () => NOW, webDistDir: dist });

    const page = await app.inject({ method: "GET", url: "/p/pool-1", headers: HTML });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("<title>Oruno</title>");
    expect(page.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page.headers["x-frame-options"]).toBe("DENY");
    expect(page.headers["cache-control"]).toBe("no-store");

    const asset = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");

    const api = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe("not_found");

    const post = await app.inject({ method: "POST", url: "/p/pool-1" });
    expect(post.statusCode).toBe(404);

    // Path traversal can't escape the website directory.
    const traversal = await app.inject({ method: "GET", url: "/assets/../../etc/passwd" });
    expect(traversal.body).not.toContain("root:");
    await app.close();
  });

  it("without a built website, page paths are plain JSON 404s", async () => {
    const { app } = await testApp(db, { clock: () => NOW });
    const page = await app.inject({ method: "GET", url: "/p/pool-1", headers: HTML });
    expect(page.statusCode).toBe(404);
    await app.close();
  });
});
