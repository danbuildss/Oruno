import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClaim, expireFinishedDrops } from "../../src/claims/claims.js";
import type { Db } from "../../src/db/client.js";
import { AppError } from "../../src/http/errors.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { claimBody, NOW, seedClaimer, seedDrop, seedOperator } from "../helpers/seed.js";

describe("claims", () => {
  let db: Db;
  let operator: { id: string; key: string };
  let now = NOW;
  const clock = () => now;

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    operator = await seedOperator(db);
    now = NOW;
  });
  afterAll(async () => {
    await db.destroy();
  });

  const claimViaApi = async (slug: string, token: string, body: object = claimBody()) => {
    const { app } = await testApp(db, { clock });
    const res = await app.inject({
      method: "POST",
      url: `/v1/drops/${slug}/claims`,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
    await app.close();
    return res;
  };

  it("lets an eligible person claim once: a pending claim, a used slot, an audit entry", async () => {
    const drop = await seedDrop(db, operator.id);
    const claimer = await seedClaimer(db);
    const res = await claimViaApi(drop.slug, claimer.token);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "pending", capMicro: "5000000", dropId: drop.id });

    const after = await db
      .selectFrom("drops")
      .select("claims_count")
      .where("id", "=", drop.id)
      .executeTakeFirstOrThrow();
    expect(after.claims_count).toBe(1);
    const audit = await db
      .selectFrom("audit_events")
      .select("action")
      .where("action", "=", "claim.created")
      .execute();
    expect(audit).toHaveLength(1);

    const again = await claimViaApi(drop.slug, claimer.token);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("already_claimed");
  });

  it("requires sign-in", async () => {
    const drop = await seedDrop(db, operator.id);
    const res = await claimViaApi(drop.slug, "oru_cs_nope");
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["terms not accepted", { acceptTerms: false }],
    ["adult not confirmed", { confirmAdult: undefined }],
    ["sanctions not confirmed", { confirmNotSanctioned: false }],
  ])("rejects a claim when %s", async (_label, change) => {
    const drop = await seedDrop(db, operator.id);
    const claimer = await seedClaimer(db);
    const res = await claimViaApi(drop.slug, claimer.token, { ...claimBody(), ...change });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an outdated terms version", async () => {
    const drop = await seedDrop(db, operator.id);
    const claimer = await seedClaimer(db);
    const res = await claimViaApi(drop.slug, claimer.token, claimBody("2020-01-01"));
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: "terms_outdated",
      details: { termsVersion: "2026-10-30" },
    });
  });

  it.each([
    ["a too-new account", { ageDays: 30 }, ["account_too_new"]],
    ["an inactive account", { publicRepos: 0, contributions: 5 }, ["not_enough_activity"]],
  ])("refuses %s with reasons", async (_label, signals, reasons) => {
    const drop = await seedDrop(db, operator.id);
    const claimer = await seedClaimer(db, signals);
    const res = await claimViaApi(drop.slug, claimer.token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: "not_eligible", details: { reasons } });
  });

  it("refuses claims on draft, paused, not-yet-started and finished drops", async () => {
    const claimer = await seedClaimer(db);
    const draft = await seedDrop(db, operator.id, {}, { activate: false });
    expect((await claimViaApi(draft.slug, claimer.token)).json().error.code).toBe(
      "drop_not_active",
    );

    const later = await seedDrop(db, operator.id, { startsAt: "2026-11-10T00:00:00Z" });
    expect((await claimViaApi(later.slug, claimer.token)).json().error.code).toBe(
      "drop_not_started",
    );

    // Session tokens last 24h, so check the ended drop at the service level.
    const drop = await seedDrop(db, operator.id);
    await expect(
      createClaim(db, {
        dropSlug: drop.slug,
        personId: claimer.personId,
        identityId: claimer.identityId,
        termsVersion: "2026-10-30",
        now: new Date("2026-11-16T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "drop_ended" });
  });

  it("CONCURRENCY: 100 people claiming 20 slots at once → exactly 20 claims", async () => {
    const drop = await seedDrop(db, operator.id, { maxClaims: 20 });
    const claimers = await Promise.all(Array.from({ length: 100 }, () => seedClaimer(db)));
    const results = await Promise.allSettled(
      claimers.map((c) =>
        createClaim(db, {
          dropSlug: drop.slug,
          personId: c.personId,
          identityId: c.identityId,
          termsVersion: "2026-10-30",
          now,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(20);
    expect(failed).toHaveLength(80);
    expect(failed.every((r) => r.reason instanceof AppError && r.reason.code === "drop_full")).toBe(
      true,
    );

    const rows = await db
      .selectFrom("claims")
      .select("id")
      .where("drop_id", "=", drop.id)
      .execute();
    const count = await db
      .selectFrom("drops")
      .select("claims_count")
      .where("id", "=", drop.id)
      .executeTakeFirstOrThrow();
    expect(rows).toHaveLength(20);
    expect(count.claims_count).toBe(20);
  });

  it("CONCURRENCY: one person claiming 10 times at once → exactly 1 claim", async () => {
    const drop = await seedDrop(db, operator.id);
    const c = await seedClaimer(db);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        createClaim(db, {
          dropSlug: drop.slug,
          personId: c.personId,
          identityId: c.identityId,
          termsVersion: "2026-10-30",
          now,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = await db
      .selectFrom("claims")
      .select("id")
      .where("drop_id", "=", drop.id)
      .execute();
    const count = await db
      .selectFrom("drops")
      .select("claims_count")
      .where("id", "=", drop.id)
      .executeTakeFirstOrThrow();
    expect(rows).toHaveLength(1);
    expect(count.claims_count).toBe(1);
  });

  it("the database itself refuses a second claim by the same person", async () => {
    const drop = await seedDrop(db, operator.id);
    const c = await seedClaimer(db);
    const row = {
      drop_id: drop.id,
      person_id: c.personId,
      identity_id: c.identityId,
      cap_micro: 5_000_000n,
      terms_version: "v",
      attested_at: now,
      ended_at: null,
      end_reason: null,
      ended_by: null,
    };
    await db.insertInto("claims").values(row).execute();
    await expect(db.insertInto("claims").values(row).execute()).rejects.toThrow(
      /claims_one_per_person_per_drop/,
    );
  });

  it("rate-limits claim attempts per IP", async () => {
    const drop = await seedDrop(db, operator.id);
    const claimer = await seedClaimer(db);
    const { app } = await testApp(db, { clock });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.slug}/claims`,
        headers: { authorization: `Bearer ${claimer.token}` },
        payload: claimBody(),
      });
      statuses.push(res.statusCode);
    }
    await app.close();
    expect(statuses[0]).toBe(201);
    expect(statuses.slice(1, 10).every((s) => s === 409)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  describe("revocation", () => {
    it("lets a claimer revoke their own claim but not someone else's; the slot stays used", async () => {
      const drop = await seedDrop(db, operator.id);
      const alice = await seedClaimer(db);
      const bob = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, alice.token)).json().id as string;
      const { app } = await testApp(db, { clock });

      const byBob = await app.inject({
        method: "POST",
        url: `/v1/me/claims/${claimId}/revoke`,
        headers: { authorization: `Bearer ${bob.token}` },
      });
      expect(byBob.statusCode).toBe(404);

      const byAlice = await app.inject({
        method: "POST",
        url: `/v1/me/claims/${claimId}/revoke`,
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(byAlice.json()).toMatchObject({ status: "revoked", endReason: "revoked_by_claimer" });

      const twice = await app.inject({
        method: "POST",
        url: `/v1/me/claims/${claimId}/revoke`,
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(twice.statusCode).toBe(409);
      await app.close();

      const count = await db
        .selectFrom("drops")
        .select("claims_count")
        .where("id", "=", drop.id)
        .executeTakeFirstOrThrow();
      expect(count.claims_count).toBe(1);
      // Revoking doesn't let the same person claim again.
      expect((await claimViaApi(drop.slug, alice.token)).json().error.code).toBe("already_claimed");
    });

    it("lets an operator revoke any claim with a reason, and audits it", async () => {
      const drop = await seedDrop(db, operator.id);
      const c = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, c.token)).json().id as string;
      const { app } = await testApp(db, { clock });
      const res = await app.inject({
        method: "POST",
        url: `/v1/claims/${claimId}/revoke`,
        headers: { authorization: `Bearer ${operator.key}` },
        payload: { reason: "key shared publicly" },
      });
      await app.close();
      expect(res.json()).toMatchObject({ status: "revoked", endReason: "key shared publicly" });
      const audit = await db
        .selectFrom("audit_events")
        .selectAll()
        .where("action", "=", "claim.revoked")
        .executeTakeFirstOrThrow();
      expect(audit).toMatchObject({
        actor_type: "operator",
        actor_id: operator.id,
        subject_id: claimId,
      });
    });
  });

  describe("drop expiry job", () => {
    it("ends finished drops and expires their open claims, and is safe to re-run", async () => {
      const drop = await seedDrop(db, operator.id);
      const c1 = await seedClaimer(db);
      const c2 = await seedClaimer(db);
      await claimViaApi(drop.slug, c1.token);
      const toRevoke = (await claimViaApi(drop.slug, c2.token)).json().id as string;
      await db
        .updateTable("claims")
        .set({ status: "revoked" })
        .where("id", "=", toRevoke)
        .execute();

      expect(await expireFinishedDrops(db, new Date("2026-11-15T23:59:59Z"))).toEqual({
        drops: 0,
        claims: 0,
      });
      expect(await expireFinishedDrops(db, new Date("2026-11-16T00:00:00Z"))).toEqual({
        drops: 1,
        claims: 1,
      });
      expect(await expireFinishedDrops(db, new Date("2026-11-16T00:01:00Z"))).toEqual({
        drops: 0,
        claims: 0,
      });

      const claims = await db
        .selectFrom("claims")
        .select(["status", "ended_by"])
        .orderBy("created_at")
        .execute();
      expect(claims).toEqual([
        { status: "expired", ended_by: "system" },
        { status: "revoked", ended_by: null },
      ]);
      const ended = await db
        .selectFrom("drops")
        .select("status")
        .where("id", "=", drop.id)
        .executeTakeFirstOrThrow();
      expect(ended.status).toBe("ended");
    });
  });
});
