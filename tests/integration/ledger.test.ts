import { sql } from "kysely";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClaim, expireFinishedDrops, revokeClaim } from "../../src/claims/claims.js";
import type { Db } from "../../src/db/client.js";
import { transitionDrop } from "../../src/drops/drops.js";
import { AppError } from "../../src/http/errors.js";
import {
  accountId,
  checkLedgerInvariants,
  dropBalances,
  postTransaction,
  recordFunding,
  recordReturn,
  releaseClaim,
  releaseEndedClaims,
} from "../../src/ledger/ledger.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { NOW, seedClaimer, seedDrop, seedOperator, txHash } from "../helpers/seed.js";

const CAP = 5_000_000n;

describe("credit ledger", () => {
  let db: Db;
  let op: { id: string; key: string };

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    op = await seedOperator(db);
  });
  afterAll(async () => {
    await db.destroy();
  });

  const claim = async (slug: string, now = NOW) => {
    const c = await seedClaimer(db);
    return createClaim(db, {
      dropSlug: slug,
      personId: c.personId,
      identityId: c.identityId,
      termsVersion: "2026-10-30",
      now,
    });
  };

  describe("rules the database enforces", () => {
    it("refuses an unbalanced transaction at commit", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      await expect(
        db.transaction().execute(async (trx) => {
          const tx = await trx
            .insertInto("ledger_transactions")
            .values({
              kind: "funding",
              drop_id: drop.id,
              claim_id: null,
              idempotency_key: "t1",
              memo: null,
              actor_type: "system",
              actor_id: null,
              created_at: undefined,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          const source = await accountId(trx, "funding_source");
          const unallocated = await accountId(trx, "drop_unallocated", { dropId: drop.id });
          await trx
            .insertInto("ledger_entries")
            .values([
              {
                transaction_id: tx.id,
                account_id: source,
                amount_micro: -100n,
                created_at: undefined,
              },
              {
                transaction_id: tx.id,
                account_id: unallocated,
                amount_micro: 99n,
                created_at: undefined,
              },
            ])
            .execute();
        }),
      ).rejects.toThrow(/unbalanced/);
    });

    it("refuses a transaction with fewer than two entries", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      await expect(
        db
          .insertInto("ledger_transactions")
          .values({
            kind: "funding",
            drop_id: drop.id,
            claim_id: null,
            idempotency_key: "t2",
            memo: null,
            actor_type: "system",
            actor_id: null,
            created_at: undefined,
          })
          .execute(),
      ).rejects.toThrow(/at least 2 required/);
    });

    it("refuses to overdraw an account", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      await expect(
        db.transaction().execute(async (trx) => {
          await postTransaction(trx, {
            kind: "return",
            dropId: drop.id,
            idempotencyKey: "overdraw",
            actor: { type: "system" },
            entries: [
              {
                accountId: await accountId(trx, "drop_unallocated", { dropId: drop.id }),
                amountMicro: -1n,
              },
              {
                accountId: await accountId(trx, "drop_returned", { dropId: drop.id }),
                amountMicro: 1n,
              },
            ],
          });
        }),
      ).rejects.toThrow(/ledger_accounts_non_negative/);
    });

    it("refuses edits and deletes of ledger records", async () => {
      await seedDrop(db, op.id);
      await expect(
        db.updateTable("ledger_entries").set({ amount_micro: 1n }).execute(),
      ).rejects.toThrow(/append-only/);
      await expect(db.deleteFrom("ledger_entries").execute()).rejects.toThrow(/append-only/);
      await expect(db.deleteFrom("ledger_transactions").execute()).rejects.toThrow(/append-only/);
      await expect(db.updateTable("fundings").set({ note: "x" }).execute()).rejects.toThrow(
        /append-only/,
      );
    });

    it("posts each movement at most once per idempotency key", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      const post = () =>
        db.transaction().execute(async (trx) =>
          postTransaction(trx, {
            kind: "funding",
            dropId: drop.id,
            idempotencyKey: "same-key",
            actor: { type: "system" },
            entries: [
              { accountId: await accountId(trx, "funding_source"), amountMicro: -10n },
              {
                accountId: await accountId(trx, "drop_unallocated", { dropId: drop.id }),
                amountMicro: 10n,
              },
            ],
          }),
        );
      expect(await post()).toBe(true);
      expect(await post()).toBe(false);
      expect((await dropBalances(db, drop.id)).unallocated).toBe(10n);
    });
  });

  describe("funding", () => {
    it("records a USDC deposit through the API and credits the drop", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      const { app } = await testApp(db);
      const reference = txHash();
      const res = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.id}/fundings`,
        headers: { authorization: `Bearer ${op.key}` },
        payload: { amountMicro: "100000000", reference, note: "Dan's deposit" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().balances).toEqual({
        fundedMicro: "100000000",
        unallocatedMicro: "100000000",
        allocatedMicro: "0",
        spentMicro: "0",
        returnedMicro: "0",
      });

      const dup = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.id}/fundings`,
        headers: { authorization: `Bearer ${op.key}` },
        payload: { amountMicro: "100000000", reference },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe("duplicate_reference");

      for (const bad of [
        { amountMicro: "1.5", reference: txHash() },
        { amountMicro: 100, reference: txHash() },
        { amountMicro: "100", reference: "0x123" },
        { amountMicro: "100", reference: txHash().toUpperCase() },
      ]) {
        const r = await app.inject({
          method: "POST",
          url: `/v1/drops/${drop.id}/fundings`,
          headers: { authorization: `Bearer ${op.key}` },
          payload: bad,
        });
        expect(r.statusCode).toBe(400);
      }
      const unauth = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.id}/fundings`,
        payload: { amountMicro: "1", reference: txHash() },
      });
      expect(unauth.statusCode).toBe(401);
      await app.close();
      expect((await dropBalances(db, drop.id)).funded).toBe(100_000_000n);
    });

    it("refuses funding an ended drop", async () => {
      const drop = await seedDrop(db, op.id);
      await transitionDrop(db, {
        dropId: drop.id,
        to: "ended",
        actor: { type: "operator", id: op.id },
        now: NOW,
      });
      await expect(
        recordFunding(db, {
          dropId: drop.id,
          amountMicro: 1n,
          reference: txHash(),
          note: null,
          operatorId: op.id,
          now: NOW,
        }),
      ).rejects.toMatchObject({ code: "drop_ended" });
    });
  });

  describe("activation requires funding for every open slot", () => {
    it("refuses an unfunded or partly funded drop, then opens once fully funded", async () => {
      const drop = await seedDrop(
        db,
        op.id,
        { maxClaims: 4 },
        { activate: false, fundMicro: 3n * CAP },
      );
      const activate = () =>
        transitionDrop(db, {
          dropId: drop.id,
          to: "active",
          actor: { type: "operator", id: op.id },
          now: NOW,
        });
      await expect(activate()).rejects.toMatchObject({
        code: "insufficient_funding",
        details: { requiredMicro: "20000000", unallocatedMicro: "15000000" },
      });
      await recordFunding(db, {
        dropId: drop.id,
        amountMicro: CAP,
        reference: txHash(),
        note: null,
        operatorId: op.id,
        now: NOW,
      });
      expect((await activate()).status).toBe("active");
    });

    it("on resume, only needs funds for the slots still open", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 2 });
      await claim(drop.slug);
      await transitionDrop(db, {
        dropId: drop.id,
        to: "paused",
        actor: { type: "operator", id: op.id },
        now: NOW,
      });
      const resumed = await transitionDrop(db, {
        dropId: drop.id,
        to: "active",
        actor: { type: "operator", id: op.id },
        now: NOW,
      });
      expect(resumed.status).toBe("active");
    });
  });

  describe("allocation on claim", () => {
    it("moves the cap from the drop to the claim", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 3 });
      const c = await claim(drop.slug);
      expect(await dropBalances(db, drop.id)).toEqual({
        funded: 3n * CAP,
        unallocated: 2n * CAP,
        allocated: CAP,
        spent: 0n,
        returned: 0n,
      });
      const acct = await db
        .selectFrom("ledger_accounts")
        .select("balance_micro")
        .where("claim_id", "=", c.id)
        .executeTakeFirstOrThrow();
      expect(acct.balance_micro).toBe(CAP);
    });

    it("CONCURRENCY: 100 claims on a drop funded for 10 (20 slots) → exactly 10; funds never go negative", async () => {
      const drop = await seedDrop(
        db,
        op.id,
        { maxClaims: 20 },
        { activate: false, fundMicro: 10n * CAP },
      );
      // Force it open to test the claim-time safety net on its own.
      await db.updateTable("drops").set({ status: "active" }).where("id", "=", drop.id).execute();
      const claimers = await Promise.all(Array.from({ length: 100 }, () => seedClaimer(db)));
      const results = await Promise.allSettled(
        claimers.map((c) =>
          createClaim(db, {
            dropSlug: drop.slug,
            personId: c.personId,
            identityId: c.identityId,
            termsVersion: "2026-10-30",
            now: NOW,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(10);
      expect(
        rejected.every(
          (r) => r.reason instanceof AppError && r.reason.code === "insufficient_funding",
        ),
      ).toBe(true);
      expect(await dropBalances(db, drop.id)).toEqual({
        funded: 10n * CAP,
        unallocated: 0n,
        allocated: 10n * CAP,
        spent: 0n,
        returned: 0n,
      });
      const count = await db
        .selectFrom("drops")
        .select("claims_count")
        .where("id", "=", drop.id)
        .executeTakeFirstOrThrow();
      expect(count.claims_count).toBe(10);
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });
  });

  describe("release of ended claims", () => {
    it("refuses releasing an open claim; releases a revoked one once; concurrent releases release once", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 2 });
      const c = await claim(drop.slug);
      await expect(
        releaseClaim(db, { claimId: c.id, actor: { type: "system" } }),
      ).rejects.toMatchObject({ code: "claim_still_open" });

      await revokeClaim(db, {
        claimId: c.id,
        by: { type: "operator", id: op.id },
        reason: "test",
        now: NOW,
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          releaseClaim(db, { claimId: c.id, actor: { type: "system" } }),
        ),
      );
      const total = results.reduce((s, r) => s + r.releasedMicro, 0n);
      expect(total).toBe(CAP);
      expect(await dropBalances(db, drop.id)).toMatchObject({
        unallocated: 2n * CAP,
        allocated: 0n,
      });
      const releases = await db
        .selectFrom("ledger_transactions")
        .select("id")
        .where("kind", "=", "claim_release")
        .execute();
      expect(releases).toHaveLength(1);
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("the release job waits for the 1-hour grace period", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 2 });
      const c = await claim(drop.slug);
      await revokeClaim(db, {
        claimId: c.id,
        by: { type: "claimer", id: c.person_id },
        reason: "self",
        now: NOW,
      });
      expect(await releaseEndedClaims(db, new Date(NOW.getTime() + 59 * 60_000))).toEqual({
        claims: 0,
        releasedMicro: 0n,
      });
      expect(await releaseEndedClaims(db, new Date(NOW.getTime() + 60 * 60_000))).toEqual({
        claims: 1,
        releasedMicro: CAP,
      });
      expect(await releaseEndedClaims(db, new Date(NOW.getTime() + 61 * 60_000))).toEqual({
        claims: 0,
        releasedMicro: 0n,
      });
    });

    it("releases claims expired when the drop ends", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 3 });
      await claim(drop.slug);
      await claim(drop.slug);
      const end = new Date("2026-11-16T00:00:00Z");
      await expireFinishedDrops(db, end);
      const result = await releaseEndedClaims(db, new Date(end.getTime() + 3_600_000));
      expect(result).toEqual({ claims: 2, releasedMicro: 2n * CAP });
      expect(await dropBalances(db, drop.id)).toMatchObject({
        unallocated: 3n * CAP,
        allocated: 0n,
      });
    });
  });

  describe("returns", () => {
    it("only after the drop ends, never more than unallocated, each transfer once", async () => {
      const drop = await seedDrop(db, op.id, { maxClaims: 3 });
      await claim(drop.slug);
      await expect(
        recordReturn(db, {
          dropId: drop.id,
          amountMicro: null,
          reference: txHash(),
          operatorId: op.id,
        }),
      ).rejects.toMatchObject({ code: "drop_not_ended" });

      await transitionDrop(db, {
        dropId: drop.id,
        to: "ended",
        actor: { type: "operator", id: op.id },
        now: NOW,
      });
      await expect(
        recordReturn(db, {
          dropId: drop.id,
          amountMicro: 3n * CAP,
          reference: txHash(),
          operatorId: op.id,
        }),
      ).rejects.toMatchObject({ code: "insufficient_funding" });

      const ref = txHash();
      const r = await recordReturn(db, {
        dropId: drop.id,
        amountMicro: null,
        reference: ref,
        operatorId: op.id,
      });
      expect(r.balances).toMatchObject({ unallocated: 0n, allocated: CAP, returned: 2n * CAP });
      await expect(
        recordReturn(db, { dropId: drop.id, amountMicro: 1n, reference: ref, operatorId: op.id }),
      ).rejects.toMatchObject({ code: "duplicate_reference" });
      await expect(
        recordReturn(db, {
          dropId: drop.id,
          amountMicro: null,
          reference: txHash(),
          operatorId: op.id,
        }),
      ).rejects.toMatchObject({ code: "nothing_to_return" });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });
  });

  describe("invariant checker", () => {
    it("reports nothing on a healthy ledger and catches a tampered balance", async () => {
      const drop = await seedDrop(db, op.id);
      await claim(drop.slug);
      expect(await checkLedgerInvariants(db)).toEqual([]);

      const { app } = await testApp(db);
      const okRes = await app.inject({
        method: "GET",
        url: "/v1/ledger/check",
        headers: { authorization: `Bearer ${op.key}` },
      });
      expect(okRes.json()).toEqual({ ok: true, violations: [] });

      // Simulate corruption that bypasses the application.
      await sql`update ledger_accounts set balance_micro = balance_micro + 1 where kind = 'drop_unallocated'`.execute(
        db,
      );
      const violations = await checkLedgerInvariants(db);
      expect(violations.map((v) => v.check).sort()).toEqual([
        "account_balance_matches_entries",
        "drop_funds_conserved",
      ]);
      const badRes = await app.inject({
        method: "GET",
        url: "/v1/ledger/check",
        headers: { authorization: `Bearer ${op.key}` },
      });
      expect(badRes.json().ok).toBe(false);
      await app.close();
    });
  });

  describe("randomized operations", () => {
    it.each([20261030, 7, 424242])(
      "keeps every invariant after each of 250 random steps (seed %i)",
      async (initialSeed) => {
        // Small deterministic PRNG so failures are reproducible.
        let seed = initialSeed;
        const rand = () => {
          seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
          return seed / 2_147_483_648;
        };
        const pick = <T>(items: T[]): T | undefined => items[Math.floor(rand() * items.length)];

        const drops = [
          await seedDrop(db, op.id, { maxClaims: 6 }),
          await seedDrop(db, op.id, { maxClaims: 4, capMicro: "2500000" }),
          await seedDrop(db, op.id, { maxClaims: 5 }, { activate: false, fundMicro: 3n * CAP }),
        ];
        let now = NOW;
        const outcomes: Record<string, number> = {};

        for (let step = 0; step < 250; step++) {
          const roll = rand();
          let op_ = "noop";
          try {
            const drop = pick(drops);
            if (!drop) continue;
            if (roll < 0.35) {
              op_ = "claim";
              await claim(drop.slug, now);
            } else if (roll < 0.5) {
              op_ = "fund";
              await recordFunding(db, {
                dropId: drop.id,
                amountMicro: BigInt(1 + Math.floor(rand() * 8)) * 1_000_000n,
                reference: txHash(),
                note: null,
                operatorId: op.id,
                now,
              });
            } else if (roll < 0.62) {
              op_ = "revoke";
              const open = await db
                .selectFrom("claims")
                .select("id")
                .where("status", "in", ["pending", "active"])
                .execute();
              const target = pick(open);
              if (target)
                await revokeClaim(db, {
                  claimId: target.id,
                  by: { type: "operator", id: op.id },
                  reason: "random",
                  now,
                });
            } else if (roll < 0.74) {
              op_ = "release";
              const ended = await db
                .selectFrom("claims")
                .select("id")
                .where("status", "in", ["revoked", "expired"])
                .execute();
              const target = pick(ended);
              if (target) await releaseClaim(db, { claimId: target.id, actor: { type: "system" } });
            } else if (roll < 0.82) {
              op_ = "transition";
              // Ending is rare so most of the run happens on live drops.
              const to = rand() < 0.1 ? "ended" : rand() < 0.5 ? "paused" : "active";
              await transitionDrop(db, {
                dropId: drop.id,
                to,
                actor: { type: "operator", id: op.id },
                now,
              });
            } else if (roll < 0.9) {
              op_ = "return";
              await recordReturn(db, {
                dropId: drop.id,
                amountMicro: null,
                reference: txHash(),
                operatorId: op.id,
              });
            } else {
              op_ = "time";
              now = new Date(now.getTime() + Math.floor(rand() * 12) * 3_600_000);
              await expireFinishedDrops(db, now);
            }
            outcomes[`${op_}:ok`] = (outcomes[`${op_}:ok`] ?? 0) + 1;
          } catch (error) {
            // Refusals are expected (full, underfunded, invalid transition...). Anything else fails the test.
            if (!(error instanceof AppError)) throw error;
            outcomes[`${op_}:${error.code}`] = (outcomes[`${op_}:${error.code}`] ?? 0) + 1;
          }
          const violations = await checkLedgerInvariants(db);
          if (violations.length > 0) {
            throw new Error(
              `Invariant broken at step ${step} (${op_}): ${JSON.stringify(violations)}`,
            );
          }
        }
        // The run must have exercised the important paths, not just refusals.
        expect(outcomes["claim:ok"] ?? 0).toBeGreaterThan(5);
        expect(outcomes["fund:ok"] ?? 0).toBeGreaterThan(5);
        expect(outcomes["revoke:ok"] ?? 0).toBeGreaterThan(3);
        expect(outcomes["release:ok"] ?? 0).toBeGreaterThan(3);
      },
      120_000,
    );
  });
});
