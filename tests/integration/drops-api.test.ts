import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";
import { dropInput, NOW, seedOperator, txHash } from "../helpers/seed.js";

describe("operator drop API", () => {
  let db: Db;
  let auth: { authorization: string };
  let now = NOW;
  const clock = () => now;

  beforeAll(async () => {
    db = await freshDb();
    const op = await seedOperator(db);
    auth = { authorization: `Bearer ${op.key}` };
  });
  afterAll(async () => {
    await db.destroy();
  });

  const create = async (overrides: Record<string, unknown> = {}, headers = auth) => {
    const { app } = await testApp(db, { clock });
    const res = await app.inject({
      method: "POST",
      url: "/v1/drops",
      headers,
      payload: dropInput(overrides),
    });
    await app.close();
    return res;
  };
  const fund = async (id: string, amountMicro = "100000000") => {
    const { app } = await testApp(db, { clock });
    const res = await app.inject({
      method: "POST",
      url: `/v1/drops/${id}/fundings`,
      headers: auth,
      payload: { amountMicro, reference: txHash() },
    });
    await app.close();
    return res;
  };
  const action = async (id: string, name: string) => {
    const { app } = await testApp(db, { clock });
    const res = await app.inject({ method: "POST", url: `/v1/drops/${id}/${name}`, headers: auth });
    await app.close();
    return res;
  };

  it("creates a draft drop with money as a string of micro-dollars", async () => {
    const res = await create({ slug: "drop-one" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      slug: "drop-one",
      status: "draft",
      capMicro: "5000000",
      maxClaims: 20,
      slotsLeft: 20,
      eligibility: { minAccountAgeDays: 180, minPublicRepos: 3, minContributions: 20 },
    });
  });

  it("requires an operator key", async () => {
    expect((await create({}, { authorization: "" })).statusCode).toBe(401);
  });

  it("rejects invalid input and duplicate slugs", async () => {
    expect((await create({ capMicro: "1.5" })).statusCode).toBe(400);
    expect((await create({ endsAt: "2026-12-03T00:00:00Z" })).statusCode).toBe(400);
    const dup = await create({ slug: "drop-one" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("slug_taken");
  });

  it("follows the drop state machine and audits each change", async () => {
    const id = (await create()).json().id as string;
    expect((await fund(id)).statusCode).toBe(201);
    expect((await action(id, "resume")).statusCode).toBe(409); // draft can't resume
    expect((await action(id, "activate")).json().status).toBe("active");
    expect((await action(id, "activate")).statusCode).toBe(409); // already active
    expect((await action(id, "pause")).json().status).toBe("paused");
    expect((await action(id, "resume")).json().status).toBe("active");
    expect((await action(id, "end")).json().status).toBe("ended");
    expect((await action(id, "activate")).statusCode).toBe(409); // ended is final

    const audit = await db
      .selectFrom("audit_events")
      .select("action")
      .where("subject_id", "=", id)
      .orderBy("id")
      .execute();
    expect(audit.map((a) => a.action)).toEqual([
      "drop.created",
      "drop.funded",
      "drop.active",
      "drop.paused",
      "drop.active",
      "drop.ended",
    ]);
  });

  it("won't activate a drop whose window is already over", async () => {
    const id = (await create()).json().id as string;
    now = new Date("2026-11-16T00:00:00Z");
    const res = await action(id, "activate");
    now = NOW;
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("drop_window_over");
  });

  it("shows active drops publicly but hides drafts", async () => {
    const draft = (await create({ slug: "hidden-draft" })).json();
    const live = (await create({ slug: "live-drop" })).json();
    await fund(live.id);
    await action(live.id, "activate");
    const { app } = await testApp(db, { clock });
    expect(
      (await app.inject({ method: "GET", url: "/v1/public/drops/hidden-draft" })).statusCode,
    ).toBe(404);
    const pub = await app.inject({ method: "GET", url: "/v1/public/drops/live-drop" });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).not.toHaveProperty("id");
    expect(pub.json()).toMatchObject({ slug: "live-drop", status: "active", slotsLeft: 20 });
    await app.close();
    expect(draft.status).toBe("draft");
  });

  it("enforces the one-calendar-month window in the database too", async () => {
    const op = await db.selectFrom("operators").select("id").executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto("drops")
        .values({
          slug: "db-guard",
          name: "x",
          cap_micro: 1n,
          max_claims: 1,
          models: ["m"],
          starts_at: new Date("2026-11-20T00:00:00Z"),
          ends_at: new Date("2026-12-02T00:00:00Z"),
          min_account_age_days: 0,
          min_public_repos: 0,
          min_contributions: 0,
          terms_version: "v",
          created_by: op.id,
        })
        .execute(),
    ).rejects.toThrow(/drops_window_one_month/);
  });
});
