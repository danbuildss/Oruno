import { sql } from "kysely";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClaim, revokeClaim } from "../../src/claims/claims.js";
import { createDb, type Db } from "../../src/db/client.js";
import { migrateToLatest, pendingMigrations } from "../../src/db/migrate.js";
import { JobRunner } from "../../src/jobs/runner.js";
import {
  issueKey,
  ORPHAN_GRACE_MS,
  retryPendingIssuance,
  revokeEndedKeys,
  revokeOrphanKeys,
} from "../../src/keys/keys.js";
import { checkLedgerInvariants, dropBalances, recordFunding } from "../../src/ledger/ledger.js";
import { createLogger } from "../../src/logger.js";
import { FakeProvider } from "../../src/providers/fake.js";
import { ProviderError } from "../../src/providers/provider.js";
import { SurplusProvider } from "../../src/providers/surplus.js";
import { LogCapture, testApp } from "../helpers/app.js";
import { freshDb, TEST_DATABASE_URL } from "../helpers/db.js";
import { claimBody, NOW, seedClaimer, seedDrop, seedOperator, txHash } from "../helpers/seed.js";

const CAP = 5_000_000n;

/** Makes the database fail inside a transaction, to prove nothing partial is left behind. */
async function failOn(db: Db, table: string, condition: string): Promise<() => Promise<void>> {
  const fn = `test_fail_${table}`;
  await sql
    .raw(`
      create or replace function ${fn}() returns trigger language plpgsql as $$
      begin
        if ${condition} then raise exception 'injected failure on ${table}'; end if;
        return new;
      end; $$;
      create trigger ${fn} before insert on ${table} for each row execute function ${fn}();
    `)
    .execute(db);
  return async () => {
    await sql.raw(`drop trigger ${fn} on ${table}; drop function ${fn}();`).execute(db);
  };
}

describe("reliability (Phase 5)", () => {
  let db: Db;
  let op: { id: string; key: string };
  let provider: FakeProvider;

  beforeEach(async () => {
    if (db) await db.destroy();
    db = await freshDb();
    op = await seedOperator(db);
    provider = new FakeProvider();
  });
  afterAll(async () => {
    await db.destroy();
  });

  describe("a transaction that fails part-way leaves nothing behind", () => {
    it("claim: failure while allocating funds → no claim, no slot used, no money moved", async () => {
      const drop = await seedDrop(db, op.id);
      const c = await seedClaimer(db);
      const restore = await failOn(
        db,
        "ledger_entries",
        "(select kind from ledger_transactions where id = new.transaction_id) = 'claim_allocation'",
      );
      await expect(
        createClaim(db, {
          dropSlug: drop.slug,
          personId: c.personId,
          identityId: c.identityId,
          termsVersion: "2026-10-30",
          now: NOW,
        }),
      ).rejects.toThrow(/injected failure/);
      await restore();

      expect(await db.selectFrom("claims").select("id").execute()).toHaveLength(0);
      const d = await db
        .selectFrom("drops")
        .select("claims_count")
        .where("id", "=", drop.id)
        .executeTakeFirstOrThrow();
      expect(d.claims_count).toBe(0);
      expect(await dropBalances(db, drop.id)).toMatchObject({
        unallocated: 20n * CAP,
        allocated: 0n,
      });
      expect(await checkLedgerInvariants(db)).toEqual([]);

      // And it works once the failure is gone.
      await createClaim(db, {
        dropSlug: drop.slug,
        personId: c.personId,
        identityId: c.identityId,
        termsVersion: "2026-10-30",
        now: NOW,
      });
      expect(await db.selectFrom("claims").select("id").execute()).toHaveLength(1);
    });

    it("funding: failure while writing the audit record → no funding, no ledger entry", async () => {
      const drop = await seedDrop(db, op.id, {}, { activate: false, fundMicro: 0n });
      const restore = await failOn(db, "audit_events", "new.action = 'drop.funded'");
      await expect(
        recordFunding(db, {
          dropId: drop.id,
          amountMicro: 10n * CAP,
          reference: txHash(),
          note: null,
          operatorId: op.id,
          now: NOW,
        }),
      ).rejects.toThrow(/injected failure/);
      await restore();
      expect(await db.selectFrom("fundings").select("id").execute()).toHaveLength(0);
      expect(await db.selectFrom("ledger_transactions").select("id").execute()).toHaveLength(0);
      expect(await dropBalances(db, drop.id)).toMatchObject({ funded: 0n, unallocated: 0n });
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("key issuance: provider created the key but saving it failed → claim stays pending; retry reuses the key", async () => {
      const drop = await seedDrop(db, op.id);
      const c = await seedClaimer(db);
      const claim = await createClaim(db, {
        dropSlug: drop.slug,
        personId: c.personId,
        identityId: c.identityId,
        termsVersion: "2026-10-30",
        now: NOW,
      });
      const restore = await failOn(db, "provider_keys", "true");
      await expect(issueKey(db, provider, { claimId: claim.id, now: NOW })).rejects.toThrow(
        /injected failure/,
      );
      await restore();
      const pending = await db
        .selectFrom("claims")
        .select("status")
        .where("id", "=", claim.id)
        .executeTakeFirstOrThrow();
      expect(pending.status).toBe("pending");
      expect(provider.keys.size).toBe(1);

      await retryPendingIssuance(db, provider, { now: new Date(NOW.getTime() + 60_000) });
      const active = await db
        .selectFrom("claims")
        .select("status")
        .where("id", "=", claim.id)
        .executeTakeFirstOrThrow();
      expect(active.status).toBe("active");
      expect(provider.keys.size).toBe(1);
      expect(await checkLedgerInvariants(db)).toEqual([]);
    });

    it("revocation: provider revoked the key but recording it failed → the job finishes safely", async () => {
      const drop = await seedDrop(db, op.id);
      const c = await seedClaimer(db);
      const claim = await createClaim(db, {
        dropSlug: drop.slug,
        personId: c.personId,
        identityId: c.identityId,
        termsVersion: "2026-10-30",
        now: NOW,
      });
      await issueKey(db, provider, { claimId: claim.id, now: NOW });
      await revokeClaim(db, {
        claimId: claim.id,
        by: { type: "operator", id: op.id },
        reason: "test",
        now: NOW,
      });
      // Simulate a crash right after the provider call: the key is revoked there but not here.
      const key = await db
        .selectFrom("provider_keys")
        .select("provider_key_id")
        .executeTakeFirstOrThrow();
      await provider.revokeKey({ keyId: key.provider_key_id, idempotencyKey: "crash" });
      expect(await revokeEndedKeys(db, provider, { now: NOW })).toEqual({ revoked: 1, failed: 0 });
      const row = await db
        .selectFrom("provider_keys")
        .select("revoked_at")
        .executeTakeFirstOrThrow();
      expect(row.revoked_at).not.toBeNull();
    });
  });

  describe("database trouble returns a retryable 503, never a hang or a leak", () => {
    it("a held row lock → 503 busy after the lock timeout; the claim succeeds once the lock is released", async () => {
      const drop = await seedDrop(db, op.id);
      const c = await seedClaimer(db);
      const fastDb = createDb(TEST_DATABASE_URL, { lockTimeoutMs: 300 });
      const { app } = await testApp(fastDb, { provider });

      let releaseLock: () => void = () => undefined;
      const holding = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let locked: () => void = () => undefined;
      const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = db.transaction().execute(async (trx) => {
        await trx.selectFrom("drops").select("id").where("id", "=", drop.id).forUpdate().execute();
        locked();
        await holding;
      });
      await isLocked;

      const busy = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.slug}/claims`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: claimBody(),
      });
      expect(busy.statusCode).toBe(503);
      expect(busy.json().error.code).toBe("busy");
      expect(busy.headers["retry-after"]).toBe("2");

      releaseLock();
      await holder;
      const ok = await app.inject({
        method: "POST",
        url: `/v1/drops/${drop.slug}/claims`,
        headers: { authorization: `Bearer ${c.token}` },
        payload: claimBody(),
      });
      expect(ok.statusCode).toBe(201);
      await app.close();
      await fastDb.destroy();
    });

    it("a query running past the statement timeout → 503 timeout", async () => {
      const slowDb = createDb(TEST_DATABASE_URL, { statementTimeoutMs: 200 });
      const { app } = await testApp(slowDb);
      app.get("/test/slow", async () => {
        await sql`select pg_sleep(2)`.execute(slowDb);
        return { ok: true };
      });
      const res = await app.inject({ method: "GET", url: "/test/slow" });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("timeout");
      await app.close();
      await slowDb.destroy();
    });

    it("an unreachable database → 503 database_unavailable, no internals in the response", async () => {
      const deadDb = createDb("postgres://oruno:oruno@127.0.0.1:1/nothing");
      const { app } = await testApp(deadDb, { provider });
      const res = await app.inject({
        method: "POST",
        url: "/v1/drops/some-drop/claims",
        headers: { authorization: `Bearer oru_cs_${"a".repeat(43)}` },
        payload: claimBody(),
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("database_unavailable");
      expect(res.body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|password/);
      await app.close();
      await deadDb.destroy();
    });

    it("connections killed by the server → requests recover without a restart", async () => {
      const appDb = createDb(TEST_DATABASE_URL, { maxConnections: 3 });
      const { app } = await testApp(appDb);
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);

      // Kill every other session of this user (as an outage or failover would).
      await sql`
        select pg_terminate_backend(pid) from pg_stat_activity
        where usename = current_user and pid <> pg_backend_pid() and datname = current_database()
      `.execute(db);

      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await app.inject({ method: "GET", url: "/health" })).statusCode);
      }
      // Some requests may hit a dead connection (503); the pool replaces it and service recovers.
      expect(statuses.every((s) => s === 200 || s === 503)).toBe(true);
      expect(statuses.at(-1)).toBe(200);
      await app.close();
      await appDb.destroy();
    });
  });

  describe("provider trouble", () => {
    it("a provider that doesn't answer times out as a retryable error, without leaking the admin key", async () => {
      const hang = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })) as typeof fetch;
      const surplus = new SurplusProvider({
        adminKey: "inf_admin_TOPSECRET",
        workspaceId: "ws",
        fetch: hang,
        timeoutMs: 50,
      });
      const err = await surplus.getKeySpend("k").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable).toBe(true);
      expect((err as Error).message).not.toContain("TOPSECRET");
    });
  });

  describe("orphaned provider keys", () => {
    it("revokes Oruno keys the database doesn't know about, but leaves in-flight issuance and other keys alone", async () => {
      const drop = await seedDrop(db, op.id);
      const mk = async () => {
        const c = await seedClaimer(db);
        return createClaim(db, {
          dropSlug: drop.slug,
          personId: c.personId,
          identityId: c.identityId,
          termsVersion: "2026-10-30",
          now: NOW,
        });
      };
      const tracked = await mk();
      await issueKey(db, provider, { claimId: tracked.id, now: NOW });
      const inFlight = await mk(); // pending, recently updated: issuance may still be finishing
      const stuck = await mk(); // pending, quiet for longer than the grace period
      await db
        .updateTable("claims")
        .set({ updated_at: new Date(NOW.getTime() - ORPHAN_GRACE_MS - 1) })
        .where("id", "=", stuck.id)
        .execute();
      const expires = new Date("2026-11-16T00:00:00Z");
      const base = { capMicro: CAP, expiresAt: expires, models: ["m"] };
      await provider.createKey({
        ...base,
        idempotencyKey: "a",
        name: `oruno-claim-${inFlight.id}`,
      });
      await provider.createKey({ ...base, idempotencyKey: "b", name: `oruno-claim-${stuck.id}` });
      await provider.createKey({
        ...base,
        idempotencyKey: "c",
        name: "oruno-claim-00000000-0000-0000-0000-000000000000",
      });
      await provider.createKey({ ...base, idempotencyKey: "d", name: "someone-elses-key" });

      const result = await revokeOrphanKeys(db, provider, { now: NOW });
      expect(result).toEqual({ checked: 4, revoked: 2 });
      const byName = new Map([...provider.keys.values()].map((k) => [k.name, k.revoked]));
      expect(byName.get(`oruno-claim-${tracked.id}`)).toBe(false);
      expect(byName.get(`oruno-claim-${inFlight.id}`)).toBe(false);
      expect(byName.get(`oruno-claim-${stuck.id}`)).toBe(true);
      expect(byName.get("oruno-claim-00000000-0000-0000-0000-000000000000")).toBe(true);
      expect(byName.get("someone-elses-key")).toBe(false);
    });
  });

  describe("restarts and crashed jobs", () => {
    it("refuses to start with pending migrations (detects them)", async () => {
      expect(await pendingMigrations(db)).toEqual([]);
      const empty = createDb(TEST_DATABASE_URL);
      await sql`drop schema if exists pgboss cascade`.execute(empty);
      await sql`drop schema public cascade`.execute(empty);
      await sql`create schema public`.execute(empty);
      expect(await pendingMigrations(empty)).toEqual([
        "0001_operators_and_audit",
        "0002_drops_and_claims",
        "0003_credit_ledger",
        "0004_provider_keys",
      ]);
      await migrateToLatest(empty);
      await empty.destroy();
    });

    it("a job queued while the worker was down runs after restart", async () => {
      const quiet = createLogger({ level: "silent" }, new LogCapture());
      const first = new JobRunner(TEST_DATABASE_URL, quiet);
      await first.start();
      await first.send("test.restart", { n: 7 });
      await first.stop();

      const seen: number[] = [];
      const second = new JobRunner(TEST_DATABASE_URL, quiet);
      await second.start();
      const done = new Promise<void>((resolve) => {
        void second.register<{ n: number }>("test.restart", async (data) => {
          seen.push(data.n);
          resolve();
        });
      });
      await Promise.race([
        done,
        new Promise((_, r) => setTimeout(() => r(new Error("not processed")), 15_000)),
      ]);
      expect(seen).toEqual([7]);
      await second.stop();
    });

    it("a job that crashes is retried and then completes", async () => {
      const quiet = createLogger({ level: "silent" }, new LogCapture());
      const runner = new JobRunner(TEST_DATABASE_URL, quiet, {
        retryDelay: 1,
        retryBackoff: false,
      });
      await runner.start();
      let attempts = 0;
      const done = new Promise<void>((resolve) => {
        void runner.register<{ n: number }>("test.flaky", async () => {
          attempts += 1;
          if (attempts < 3) throw new Error("simulated crash");
          resolve();
        });
      });
      await runner.send("test.flaky", { n: 1 });
      await Promise.race([
        done,
        new Promise((_, r) => setTimeout(() => r(new Error("never completed")), 25_000)),
      ]);
      expect(attempts).toBe(3);
      await runner.stop();
    }, 30_000);
  });
});
