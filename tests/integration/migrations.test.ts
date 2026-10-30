import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../src/db/client.js";
import { migrateAllDown, migrateToLatest } from "../../src/db/migrate.js";
import { resetDatabase, TEST_DATABASE_URL } from "../helpers/db.js";

async function tableNames(db: Db): Promise<string[]> {
  const result = await sql<{ table_name: string }>`
    select table_name from information_schema.tables where table_schema = 'public' order by table_name
  `.execute(db);
  return result.rows.map((r) => r.table_name);
}

describe("migrations", () => {
  let db: Db;
  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    await resetDatabase(db);
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("apply on a clean database", async () => {
    const steps = await migrateToLatest(db);
    expect(steps).toEqual([
      "Up 0001_operators_and_audit: Success",
      "Up 0002_drops_and_claims: Success",
      "Up 0003_credit_ledger: Success",
    ]);
    expect(await tableNames(db)).toEqual(
      expect.arrayContaining([
        "audit_events",
        "operators",
        "kysely_migration",
        "kysely_migration_lock",
      ]),
    );
  });

  it("are idempotent: running again does nothing", async () => {
    expect(await migrateToLatest(db)).toEqual([]);
  });

  it("roll back completely", async () => {
    const steps = await migrateAllDown(db);
    expect(steps).toEqual([
      "Down 0003_credit_ledger: Success",
      "Down 0002_drops_and_claims: Success",
      "Down 0001_operators_and_audit: Success",
    ]);
    const tables = await tableNames(db);
    expect(tables).not.toContain("operators");
    expect(tables).not.toContain("audit_events");
  });

  it("re-apply after a full rollback", async () => {
    expect(await migrateToLatest(db)).toHaveLength(3);
  });

  it("enforce an append-only audit log", async () => {
    await db
      .insertInto("audit_events")
      .values({
        actor_type: "system",
        actor_id: null,
        action: "test.event",
        subject_type: null,
        subject_id: null,
        details: "{}",
      })
      .execute();
    await expect(
      db.updateTable("audit_events").set({ action: "changed" }).execute(),
    ).rejects.toThrow(/append-only/);
    await expect(db.deleteFrom("audit_events").execute()).rejects.toThrow(/append-only/);
  });

  it("reject invalid rows through constraints", async () => {
    await expect(
      db
        .insertInto("operators")
        .values({ name: "  ", key_prefix: "p1", key_hash: "a".repeat(64), disabled_at: null })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto("operators")
        .values({ name: "x", key_prefix: "p2", key_hash: "not-a-hash", disabled_at: null })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto("audit_events")
        .values({
          actor_type: "hacker" as "system",
          actor_id: null,
          action: "x",
          subject_type: null,
          subject_id: null,
          details: "{}",
        })
        .execute(),
    ).rejects.toThrow();
  });
});
