import { sql } from "kysely";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { FakeGitHub, githubProfile, signInThroughApi } from "../helpers/fake-github.js";
import { NOW } from "../helpers/seed.js";

describe("GitHub sign-in (state + PKCE)", () => {
  let db: Db;
  let github: FakeGitHub;
  let now: Date;
  const clock = () => now;

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    github = new FakeGitHub();
    now = NOW;
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("signs in, stores the GitHub signals and returns a working session", async () => {
    const { app, logs } = await testApp(db, { github, clock });
    const profile = githubProfile({ now, ageDays: 500, publicRepos: 9, contributionsLastYear: 77 });
    const { callback, state, code } = await signInThroughApi(app, github, profile, "drop-1");

    expect(callback.statusCode).toBe(200);
    const body = callback.json();
    expect(body).toMatchObject({ login: profile.login, drop: "drop-1" });
    expect(body.sessionToken).toMatch(/^oru_cs_/);

    const identity = await db.selectFrom("identities").selectAll().executeTakeFirstOrThrow();
    expect(identity).toMatchObject({
      provider_user_id: profile.id,
      public_repos: 9,
      contributions_last_year: 77,
    });

    const me = await app.inject({
      method: "GET",
      url: "/v1/me/claims",
      headers: { authorization: `Bearer ${body.sessionToken}` },
    });
    expect(me.statusCode).toBe(200);

    // Neither the session token nor the one-time code/state reach the logs or the database.
    expect(logs.text).not.toContain(body.sessionToken);
    expect(logs.text).not.toContain(code);
    expect(logs.text).not.toContain(state);
    const dbDump = await sql<{ t: string }>`
      select (select coalesce(json_agg(s), '[]') from claimer_sessions s)::text
          || (select coalesce(json_agg(o), '[]') from oauth_states o)::text as t
    `.execute(db);
    const dumped = dbDump.rows[0]?.t ?? "";
    expect(dumped).not.toContain(body.sessionToken);
    expect(dumped).not.toContain(state);

    const audit = await db.selectFrom("audit_events").select("action").execute();
    expect(audit.map((a) => a.action)).toContain("claimer.signed_in");
    await app.close();
  });

  it("refuses a replayed callback (state is single-use)", async () => {
    const { app } = await testApp(db, { github, clock });
    const { callback, state } = await signInThroughApi(app, github, githubProfile({ now }));
    expect(callback.statusCode).toBe(200);
    const code2 = github.approve(state, githubProfile({ now }));
    const replay = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?code=${code2}&state=${state}`,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe("invalid_state");
    await app.close();
  });

  it("refuses an expired state (older than 10 minutes)", async () => {
    const { app } = await testApp(db, { github, clock });
    const start = await app.inject({ method: "GET", url: "/v1/auth/github/start" });
    const state = new URL(start.json().authorizeUrl).searchParams.get("state") ?? "";
    const code = github.approve(state, githubProfile({ now }));
    now = new Date(NOW.getTime() + 10 * 60 * 1000 + 1);
    const res = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?code=${code}&state=${state}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_state");
    await app.close();
  });

  it("refuses a forged state", async () => {
    const { app } = await testApp(db, { github, clock });
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/github/callback?code=abc&state=forged",
    });
    expect(res.statusCode).toBe(400);
    expect(github.exchangeAttempts).toBe(0);
    await app.close();
  });

  it("fails sign-in if the PKCE verifier doesn't match (code issued for another challenge)", async () => {
    const { app } = await testApp(db, { github, clock });
    const start = await app.inject({ method: "GET", url: "/v1/auth/github/start" });
    const state = new URL(start.json().authorizeUrl).searchParams.get("state") ?? "";
    const code = github.approve(state, githubProfile({ now }), { challenge: "attacker-challenge" });
    const res = await app.inject({
      method: "GET",
      url: `/v1/auth/github/callback?code=${code}&state=${state}`,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("github_unavailable");
    expect(await db.selectFrom("claimer_sessions").select("id").execute()).toHaveLength(0);
    await app.close();
  });

  it("links repeat sign-ins to the same person and refreshes signals", async () => {
    const { app } = await testApp(db, { github, clock });
    const profile = githubProfile({ now, publicRepos: 1 });
    await signInThroughApi(app, github, profile);
    await signInThroughApi(app, github, { ...profile, publicRepos: 10 });
    const people = await db.selectFrom("people").select("id").execute();
    const identities = await db.selectFrom("identities").select(["public_repos"]).execute();
    expect(people).toHaveLength(1);
    expect(identities).toEqual([{ public_repos: 10 }]);
    await app.close();
  });

  it("handles two simultaneous first sign-ins for the same GitHub user without duplicating them", async () => {
    const { app } = await testApp(db, { github, clock });
    const profile = githubProfile({ now });
    const results = await Promise.all([
      signInThroughApi(app, github, profile),
      signInThroughApi(app, github, profile),
    ]);
    expect(results.map((r) => r.callback.statusCode)).toEqual([200, 200]);
    expect(await db.selectFrom("people").select("id").execute()).toHaveLength(1);
    expect(await db.selectFrom("identities").select("id").execute()).toHaveLength(1);
    await app.close();
  });

  it("expires sessions after 24 hours and supports sign-out", async () => {
    const { app } = await testApp(db, { github, clock });
    const { callback } = await signInThroughApi(app, github, githubProfile({ now }));
    const auth = { authorization: `Bearer ${callback.json().sessionToken}` };

    now = new Date(NOW.getTime() + 24 * 3600 * 1000 + 1);
    expect(
      (await app.inject({ method: "GET", url: "/v1/me/claims", headers: auth })).statusCode,
    ).toBe(401);

    now = NOW;
    const second = await signInThroughApi(app, github, githubProfile({ now }));
    const auth2 = { authorization: `Bearer ${second.callback.json().sessionToken}` };
    expect(
      (await app.inject({ method: "POST", url: "/v1/auth/sign-out", headers: auth2 })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: "/v1/me/claims", headers: auth2 })).statusCode,
    ).toBe(401);
    await app.close();
  });

  it("refuses sign-in for a blocked person", async () => {
    const { app } = await testApp(db, { github, clock });
    const profile = githubProfile({ now });
    await signInThroughApi(app, github, profile);
    await db.updateTable("people").set({ blocked_at: now }).execute();
    const { callback } = await signInThroughApi(app, github, profile);
    expect(callback.statusCode).toBe(403);
    expect(callback.json().error.code).toBe("person_blocked");
    await app.close();
  });

  it("returns 503 when GitHub isn't configured", async () => {
    const { app } = await testApp(db, { github: null, clock });
    const res = await app.inject({ method: "GET", url: "/v1/auth/github/start" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("github_not_configured");
    await app.close();
  });

  it("rate-limits sign-in attempts per IP", async () => {
    const { app } = await testApp(db, { github, clock });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await app.inject({ method: "GET", url: "/v1/auth/github/start" })).statusCode);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    await app.close();
  });
});
