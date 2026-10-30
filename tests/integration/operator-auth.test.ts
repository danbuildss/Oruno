import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOperator, disableOperator } from "../../src/auth/operator-keys.js";
import type { Db } from "../../src/db/client.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";

describe("operator authentication", () => {
  let db: Db;
  let key: string;
  let operatorId: string;

  beforeAll(async () => {
    db = await freshDb();
    const created = await createOperator(db, "Dan");
    key = created.key;
    operatorId = created.operator.id;
  });
  afterAll(async () => {
    await db.destroy();
  });

  const me = async (authorization?: string) => {
    const { app, logs } = await testApp(db);
    const res = await app.inject({
      method: "GET",
      url: "/v1/operator/me",
      headers: authorization === undefined ? {} : { authorization },
    });
    await app.close();
    return { res, logs };
  };

  it("accepts a valid key", async () => {
    const { res } = await me(`Bearer ${key}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: operatorId, name: "Dan" });
    expect(key.startsWith(res.json().keyPrefix)).toBe(true);
  });

  // Headers are built lazily: `key` only exists once beforeAll has run.
  it.each<[string, () => string | undefined]>([
    ["missing header", () => undefined],
    ["wrong scheme", () => `Basic ${key}`],
    ["key without scheme", () => key],
    ["malformed key", () => "Bearer not-a-key"],
    ["unknown key", () => `Bearer oru_op_${"A".repeat(43)}`],
  ])("rejects %s with 401", async (_label, header) => {
    const { res } = await me(header());
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthorized");
  });

  it("never stores the key in plain text", async () => {
    const dump = await sql<{
      row: string;
    }>`select row_to_json(o)::text as row from operators o`.execute(db);
    const audit = await sql<{
      row: string;
    }>`select row_to_json(a)::text as row from audit_events a`.execute(db);
    for (const { row } of [...dump.rows, ...audit.rows]) {
      expect(row).not.toContain(key);
    }
  });

  it("never writes the key to the logs", async () => {
    const { logs } = await me(`Bearer ${key}`);
    expect(logs.text.length).toBeGreaterThan(0);
    expect(logs.text).not.toContain(key);
  });

  it("records operator creation in the audit log", async () => {
    const events = await db
      .selectFrom("audit_events")
      .selectAll()
      .where("action", "=", "operator.created")
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      subject_type: "operator",
      subject_id: operatorId,
      actor_type: "system",
    });
  });

  it("rejects a disabled operator's key and audits the change", async () => {
    await disableOperator(db, operatorId, { type: "system" });
    const { res } = await me(`Bearer ${key}`);
    expect(res.statusCode).toBe(401);
    const disabled = await db
      .selectFrom("audit_events")
      .select("id")
      .where("action", "=", "operator.disabled")
      .execute();
    expect(disabled).toHaveLength(1);
  });

  it("refuses an empty operator name", async () => {
    await expect(createOperator(db, "   ")).rejects.toThrow(/name is required/);
  });
});
