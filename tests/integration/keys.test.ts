import { sql } from "kysely";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClaim, expireFinishedDrops, revokeClaim } from "../../src/claims/claims.js";
import type { Db } from "../../src/db/client.js";
import { transitionDrop } from "../../src/drops/drops.js";
import { AppError } from "../../src/http/errors.js";
import {
  issueKey,
  MAX_ISSUE_ATTEMPTS,
  retryPendingIssuance,
  revealOrRotateKey,
  revokeEndedKeys,
  syncAllSpend,
  syncClaimSpend,
} from "../../src/keys/keys.js";
import {
  checkLedgerInvariants,
  dropBalances,
  recordFunding,
  releaseClaim,
  releaseEndedClaims,
} from "../../src/ledger/ledger.js";
import { FakeProvider } from "../../src/providers/fake.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { claimBody, NOW, seedClaimer, seedDrop, seedOperator, txHash } from "../helpers/seed.js";

const CAP = 5_000_000n;
const MODEL = "claude-sonnet-5";

describe("provider keys (fake provider)", () => {
  let db: Db;
  let op: { id: string; key: string };
  let provider: FakeProvider;
  let now = NOW;
  const clock = () => now;

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    op = await seedOperator(db);
    provider = new FakeProvider();
    now = NOW;
  });
  afterAll(async () => {
    await db.destroy();
  });

  const claimViaApi = async (slug: string, token: string) => {
    const { app, logs } = await testApp(db, { clock, provider });
    const res = await app.inject({
      method: "POST",
      url: `/v1/drops/${slug}/claims`,
      headers: { authorization: `Bearer ${token}` },
      payload: claimBody(),
    });
    await app.close();
    return { res, logs };
  };
  const keyViaApi = async (claimId: string, token: string) => {
    const { app } = await testApp(db, { clock, provider });
    const res = await app.inject({
      method: "POST",
      url: `/v1/me/claims/${claimId}/key`,
      headers: { authorization: `Bearer ${token}` },
    });
    await app.close();
    return res;
  };
  const keyIdOf = async (claimId: string) =>
    (
      await db
        .selectFrom("provider_keys")
        .select("provider_key_id")
        .where("claim_id", "=", claimId)
        .where("retired_at", "is", null)
        .executeTakeFirstOrThrow()
    ).provider_key_id;
  const pendingClaim = async (slug: string) => {
    const c = await seedClaimer(db);
    const claim = await createClaim(db, {
      dropSlug: slug,
      personId: c.personId,
      identityId: c.identityId,
      termsVersion: "2026-10-30",
      now,
    });
    return { claim, claimer: c };
  };

  it("issues a working key on claim: capped, scoped to the drop's models, expiring with the drop; secret never stored or logged", async () => {
    const drop = await seedDrop(db, op.id, { models: [MODEL] });
    const claimer = await seedClaimer(db);
    const { res, logs } = await claimViaApi(drop.slug, claimer.token);
    expect(res.statusCode).toBe(201);
    const { claim, key } = res.json();
    expect(claim.status).toBe("active");
    expect(key.setup).toEqual({
      ANTHROPIC_BASE_URL: provider.claudeCodeBaseUrl,
      ANTHROPIC_AUTH_TOKEN: key.secret,
      ANTHROPIC_API_KEY: "",
    });
    expect(provider.accepts(key.secret, MODEL, now)).toBe(true);
    expect(provider.accepts(key.secret, "gpt-other", now)).toBe(false);
    expect(provider.accepts(key.secret, MODEL, new Date("2026-11-16T00:00:00Z"))).toBe(false);
    const fakeKey = provider.keys.get(await keyIdOf(claim.id));
    expect(fakeKey?.capMicro).toBe(CAP);

    // The secret appears nowhere in the database or the logs.
    const tables = await sql<{ t: string }>`
      select string_agg(table_name, ',') as t from information_schema.tables where table_schema = 'public'
    `.execute(db);
    for (const table of (tables.rows[0]?.t ?? "").split(",")) {
      const dump = await sql<{
        j: string;
      }>`select coalesce(json_agg(x), '[]')::text as j from ${sql.table(table)} x`.execute(db);
      expect(dump.rows[0]?.j ?? "").not.toContain(key.secret);
    }
    expect(logs.text).not.toContain(key.secret);
    const row = await db
      .selectFrom("claims")
      .select("secret_delivered")
      .where("id", "=", claim.id)
      .executeTakeFirstOrThrow();
    expect(row.secret_delivered).toBe(true);
  });

  it("returns 503 when no provider is configured", async () => {
    const drop = await seedDrop(db, op.id);
    const claimer = await seedClaimer(db);
    const { app } = await testApp(db, { clock, provider: null });
    const res = await app.inject({
      method: "POST",
      url: `/v1/drops/${drop.slug}/claims`,
      headers: { authorization: `Bearer ${claimer.token}` },
      payload: claimBody(),
    });
    await app.close();
    expect(res.statusCode).toBe(503);
    expect(await db.selectFrom("claims").select("id").execute()).toHaveLength(0);
  });

  it("OUTAGE: keeps the claim pending, retries, then lets the claimer fetch the key", async () => {
    const drop = await seedDrop(db, op.id);
    const claimer = await seedClaimer(db);
    provider.failNext("createKey", { retryable: true, times: 2 });
    const { res } = await claimViaApi(drop.slug, claimer.token);
    expect(res.statusCode).toBe(202);
    const claimId = res.json().claim.id as string;
    expect(res.json().claim.status).toBe("pending");

    now = new Date(NOW.getTime() + 60_000);
    expect(await retryPendingIssuance(db, provider, { now })).toEqual({
      activated: 0,
      failed: 0,
      stillPending: 1,
    });
    now = new Date(NOW.getTime() + 120_000);
    expect(await retryPendingIssuance(db, provider, { now })).toEqual({
      activated: 1,
      failed: 0,
      stillPending: 0,
    });

    // The job's secret was never delivered; the first fetch doesn't count as a rotation.
    const first = await keyViaApi(claimId, claimer.token);
    expect(first.statusCode).toBe(200);
    expect(provider.accepts(first.json().key.secret, "claude-sonnet-5", now)).toBe(true);
    const row = await db
      .selectFrom("claims")
      .select(["rotations", "secret_delivered"])
      .where("id", "=", claimId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ rotations: 0, secret_delivered: true });
    expect(provider.calls.createKey).toBe(3);
  });

  it("PERMANENT FAILURE: fails the claim, releases funds, frees the slot, and allows claiming again", async () => {
    const drop = await seedDrop(db, op.id, { maxClaims: 1 });
    const claimer = await seedClaimer(db);
    provider.failNext("createKey", { retryable: false });
    const { res } = await claimViaApi(drop.slug, claimer.token);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("key_issue_failed");
    expect(await dropBalances(db, drop.id)).toMatchObject({ unallocated: CAP, allocated: 0n });
    const d = await db
      .selectFrom("drops")
      .select("claims_count")
      .where("id", "=", drop.id)
      .executeTakeFirstOrThrow();
    expect(d.claims_count).toBe(0);
    const again = await claimViaApi(drop.slug, claimer.token);
    expect(again.res.statusCode).toBe(201);
    expect(await checkLedgerInvariants(db)).toEqual([]);
  });

  it(`gives up after ${MAX_ISSUE_ATTEMPTS} retryable failures`, async () => {
    const drop = await seedDrop(db, op.id);
    const { claim } = await pendingClaim(drop.slug);
    provider.failNext("createKey", { retryable: true, times: MAX_ISSUE_ATTEMPTS });
    for (let i = 0; i < MAX_ISSUE_ATTEMPTS; i++) {
      await issueKey(db, provider, { claimId: claim.id, now });
    }
    const row = await db
      .selectFrom("claims")
      .select(["status", "issue_attempts"])
      .where("id", "=", claim.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("failed");
    expect(await dropBalances(db, drop.id)).toMatchObject({ allocated: 0n });
  });

  it("CRASH RECOVERY: a key created before a crash is reused on retry, never duplicated", async () => {
    const drop = await seedDrop(db, op.id);
    const { claim } = await pendingClaim(drop.slug);
    // Simulate: the provider created the key, then Oruno crashed before saving it.
    await provider.createKey({
      idempotencyKey: `oruno:claim:${claim.id}:create`,
      name: "x",
      capMicro: CAP,
      expiresAt: new Date("2026-11-16T00:00:00Z"),
      models: [MODEL],
    });
    await retryPendingIssuance(db, provider, { now: new Date(NOW.getTime() + 60_000) });
    expect(provider.keys.size).toBe(1);
    const row = await db
      .selectFrom("claims")
      .select("status")
      .where("id", "=", claim.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("active");
  });

  it("CONCURRENCY: simultaneous issuance attempts for one claim activate it once with one key", async () => {
    const drop = await seedDrop(db, op.id);
    const { claim } = await pendingClaim(drop.slug);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => issueKey(db, provider, { claimId: claim.id, now })),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(provider.keys.size).toBe(1);
    expect(await db.selectFrom("provider_keys").select("id").execute()).toHaveLength(1);
  });

  it("ROTATION: new secret works, old doesn't, new cap is what's left, limited to 3 replacements", async () => {
    const drop = await seedDrop(db, op.id, { models: [MODEL] });
    const claimer = await seedClaimer(db);
    const { res } = await claimViaApi(drop.slug, claimer.token);
    const claimId = res.json().claim.id as string;
    const firstSecret = res.json().key.secret as string;
    provider.spend(await keyIdOf(claimId), 2_000_000n);

    const rotated = await keyViaApi(claimId, claimer.token);
    expect(rotated.statusCode).toBe(200);
    const secret2 = rotated.json().key.secret as string;
    expect(provider.accepts(firstSecret, MODEL, now)).toBe(false);
    expect(provider.accepts(secret2, MODEL, now)).toBe(true);
    // Rotation can't reset the budget: the new key holds only the remaining $3.
    const newKeyId = await keyIdOf(claimId);
    expect(provider.keys.get(newKeyId)?.capMicro).toBe(3_000_000n);
    expect(provider.spend(newKeyId, 10_000_000n)).toBe(3_000_000n);
    await syncClaimSpend(db, provider, { claimId, now });
    const row = await db
      .selectFrom("claims")
      .select("status")
      .where("id", "=", claimId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("exhausted");
    expect(await checkLedgerInvariants(db)).toEqual([]);
  });

  it("enforces the rotation limit", async () => {
    const drop = await seedDrop(db, op.id);
    const claimer = await seedClaimer(db);
    const { res } = await claimViaApi(drop.slug, claimer.token);
    const claimId = res.json().claim.id as string;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await keyViaApi(claimId, claimer.token)).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    // Someone else can't touch it.
    const other = await seedClaimer(db);
    expect((await keyViaApi(claimId, other.token)).statusCode).toBe(404);
  });

  it("REVOCATION reaches the provider, including after a provider error (retried by the job)", async () => {
    const drop = await seedDrop(db, op.id, { models: [MODEL] });
    const claimer = await seedClaimer(db);
    const { res } = await claimViaApi(drop.slug, claimer.token);
    const claimId = res.json().claim.id as string;
    const secret = res.json().key.secret as string;

    provider.failNext("revokeKey", { retryable: true });
    const { app } = await testApp(db, { clock, provider });
    const r = await app.inject({
      method: "POST",
      url: `/v1/me/claims/${claimId}/revoke`,
      headers: { authorization: `Bearer ${claimer.token}` },
    });
    await app.close();
    expect(r.json().status).toBe("revoked");
    expect(provider.accepts(secret, MODEL, now)).toBe(true); // provider call failed...
    expect(await revokeEndedKeys(db, provider, { now })).toEqual({ revoked: 1, failed: 0 });
    expect(provider.accepts(secret, MODEL, now)).toBe(false); // ...the job finished it.
    expect(await revokeEndedKeys(db, provider, { now })).toEqual({ revoked: 0, failed: 0 });
  });

  it("revokes keys of claims expired when the drop ends", async () => {
    const drop = await seedDrop(db, op.id, { models: [MODEL] });
    const claimer = await seedClaimer(db);
    const secret = (await claimViaApi(drop.slug, claimer.token)).res.json().key.secret as string;
    await expireFinishedDrops(db, new Date("2026-11-16T00:00:00Z"));
    await revokeEndedKeys(db, provider, { now });
    expect([...provider.keys.values()].every((k) => k.revoked)).toBe(true);
    expect(provider.accepts(secret, MODEL, NOW)).toBe(false);
  });

  describe("spend", () => {
    it("records provider spend in the ledger, idempotently and once under concurrency", async () => {
      const drop = await seedDrop(db, op.id);
      const claimer = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, claimer.token)).res.json().claim.id as string;
      provider.spend(await keyIdOf(claimId), 1_200_000n);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => syncClaimSpend(db, provider, { claimId, now })),
      );
      expect(results.reduce((s, r) => s + r.recordedMicro, 0n)).toBe(1_200_000n);
      expect(await dropBalances(db, drop.id)).toMatchObject({
        unallocated: 19n * CAP,
        allocated: 3_800_000n,
        spent: 1_200_000n,
      });
      expect((await syncClaimSpend(db, provider, { claimId, now })).recordedMicro).toBe(0n);
      const spends = await db
        .selectFrom("ledger_transactions")
        .select("id")
        .where("kind", "=", "spend")
        .execute();
      expect(spends).toHaveLength(1);

      const { app } = await testApp(db, { clock, provider });
      const me = await app.inject({
        method: "GET",
        url: "/v1/me/claims",
        headers: { authorization: `Bearer ${claimer.token}` },
      });
      await app.close();
      expect(me.json().claims[0]).toMatchObject({
        spentMicro: "1200000",
        remainingMicro: "3800000",
      });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("marks a claim exhausted at its cap; the key is then revoked and nothing is left to release", async () => {
      const drop = await seedDrop(db, op.id);
      const claimer = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, claimer.token)).res.json().claim.id as string;
      provider.spend(await keyIdOf(claimId), 99_000_000n);
      await syncAllSpend(db, provider, { now });
      const row = await db
        .selectFrom("claims")
        .select(["status", "overshoot_micro"])
        .where("id", "=", claimId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ status: "exhausted", overshoot_micro: 0n });
      expect(await revokeEndedKeys(db, provider, { now })).toEqual({ revoked: 1, failed: 0 });
      expect(await releaseClaim(db, { claimId, actor: { type: "system" } })).toEqual({
        releasedMicro: 0n,
      });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("OVERSHOOT: spend past the cap is capped in the ledger, recorded on the claim and flagged", async () => {
      const drop = await seedDrop(db, op.id);
      const claimer = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, claimer.token)).res.json().claim.id as string;
      provider.spend(await keyIdOf(claimId), CAP + 250_000n, { overshoot: true });
      const r = await syncClaimSpend(db, provider, { claimId, now });
      expect(r).toEqual({ recordedMicro: CAP, overshootMicro: 250_000n });
      const flag = await db
        .selectFrom("audit_events")
        .select("details")
        .where("action", "=", "claim.overshoot")
        .executeTakeFirstOrThrow();
      expect(flag.details).toMatchObject({ overshootMicro: "250000" });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("records final usage before releasing an ended claim", async () => {
      const drop = await seedDrop(db, op.id);
      const claimer = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, claimer.token)).res.json().claim.id as string;
      provider.spend(await keyIdOf(claimId), 700_000n);
      await revokeClaim(db, { claimId, by: { type: "operator", id: op.id }, reason: "test", now });
      // The release job syncs spend first, then releases the rest.
      const later = new Date(NOW.getTime() + 3_600_000);
      await syncAllSpend(db, provider, { now: later });
      const released = await releaseEndedClaims(db, later);
      expect(released).toEqual({ claims: 1, releasedMicro: CAP - 700_000n });
      expect(await dropBalances(db, drop.id)).toMatchObject({ spent: 700_000n });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("usage reported after release is flagged as overshoot, never taken from other funds", async () => {
      const drop = await seedDrop(db, op.id);
      const claimer = await seedClaimer(db);
      const claimId = (await claimViaApi(drop.slug, claimer.token)).res.json().claim.id as string;
      const keyId = await keyIdOf(claimId);
      await revokeClaim(db, { claimId, by: { type: "operator", id: op.id }, reason: "test", now });
      await releaseClaim(db, { claimId, actor: { type: "system" } });
      const fakeKey = provider.keys.get(keyId);
      if (!fakeKey) throw new Error("fake key missing");
      fakeKey.spentMicro = 300_000n; // late usage report
      const r = await syncClaimSpend(db, provider, { claimId, now });
      expect(r).toEqual({ recordedMicro: 0n, overshootMicro: 300_000n });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });
  });

  it("keeps the provider spend ceiling equal to funds held", async () => {
    const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
    const { app } = await testApp(db, { clock, provider });
    await app.inject({
      method: "POST",
      url: `/v1/drops/${drop.id}/fundings`,
      headers: { authorization: `Bearer ${op.key}` },
      payload: { amountMicro: "100000000", reference: txHash() },
    });
    expect(provider.ceilingMicro).toBe(100_000_000n);
    await transitionDrop(db, {
      dropId: drop.id,
      to: "ended",
      actor: { type: "operator", id: op.id },
      now,
    });
    await app.inject({
      method: "POST",
      url: `/v1/drops/${drop.id}/returns`,
      headers: { authorization: `Bearer ${op.key}` },
      payload: { amountMicro: "40000000", reference: txHash() },
    });
    await app.close();
    expect(provider.ceilingMicro).toBe(60_000_000n);
  });

  it("RANDOMIZED: invariants hold after every step with keys, spend, rotation, revocation and releases", async () => {
    let seed = 99;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(items: T[]): T | undefined => items[Math.floor(rand() * items.length)];
    const drops = [
      await seedDrop(db, op.id, { maxClaims: 8 }),
      await seedDrop(db, op.id, { maxClaims: 6, capMicro: "2000000" }),
    ];
    const counts: Record<string, number> = {};
    const bump = (k: string) => {
      counts[k] = (counts[k] ?? 0) + 1;
    };

    for (let step = 0; step < 200; step++) {
      const roll = rand();
      try {
        if (roll < 0.25) {
          const drop = pick(drops);
          if (!drop) continue;
          const { claim } = await pendingClaim(drop.slug);
          if (rand() < 0.2) provider.failNext("createKey", { retryable: rand() < 0.7 });
          await issueKey(db, provider, { claimId: claim.id, now });
          bump("claim");
        } else if (roll < 0.5) {
          const keys = await db
            .selectFrom("provider_keys")
            .innerJoin("claims", "claims.id", "provider_keys.claim_id")
            .select("provider_keys.provider_key_id")
            .where("claims.status", "=", "active")
            .where("provider_keys.retired_at", "is", null)
            .execute();
          const k = pick(keys);
          if (k)
            provider.spend(k.provider_key_id, BigInt(1 + Math.floor(rand() * 2_000_000)), {
              overshoot: rand() < 0.05,
            });
          bump("spend");
        } else if (roll < 0.65) {
          await syncAllSpend(db, provider, { now });
          bump("sync");
        } else if (roll < 0.72) {
          const active = await db
            .selectFrom("claims")
            .select(["id", "person_id"])
            .where("status", "=", "active")
            .execute();
          const c = pick(active);
          if (c)
            await revealOrRotateKey(db, provider, { claimId: c.id, personId: c.person_id, now });
          bump("rotate");
        } else if (roll < 0.82) {
          const open = await db
            .selectFrom("claims")
            .select("id")
            .where("status", "in", ["pending", "active"])
            .execute();
          const c = pick(open);
          if (c)
            await revokeClaim(db, {
              claimId: c.id,
              by: { type: "operator", id: op.id },
              reason: "r",
              now,
            });
          await revokeEndedKeys(db, provider, { now });
          bump("revoke");
        } else if (roll < 0.92) {
          await syncAllSpend(db, provider, { now });
          await releaseEndedClaims(db, now, 0);
          bump("release");
        } else {
          await retryPendingIssuance(db, provider, { now, olderThanMs: 0 });
          const drop = pick(drops);
          if (drop) {
            await recordFunding(db, {
              dropId: drop.id,
              amountMicro: 3_000_000n,
              reference: txHash(),
              note: null,
              operatorId: op.id,
              now,
            });
          }
          bump("retry+fund");
        }
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        bump(`refused:${error.code}`);
      }
      const violations = await checkLedgerInvariants(db);
      if (violations.length > 0) throw new Error(`step ${step}: ${JSON.stringify(violations)}`);
    }
    expect(counts.claim ?? 0).toBeGreaterThan(10);
    expect(counts.sync ?? 0).toBeGreaterThan(10);
    expect(counts.revoke ?? 0).toBeGreaterThan(5);
    const spent = await db
      .selectFrom("ledger_transactions")
      .select("id")
      .where("kind", "=", "spend")
      .execute();
    expect(spent.length).toBeGreaterThan(5);
  }, 180_000);
});
