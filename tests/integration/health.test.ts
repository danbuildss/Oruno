import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../src/db/client.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";

describe("GET /health", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("reports ok when the database is reachable", async () => {
    const { app } = testApp(db);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", database: "ok" });
    await app.close();
  });

  it("reports degraded (503) when the database is unreachable", async () => {
    const deadDb = createDb("postgres://oruno:oruno@127.0.0.1:1/nothing");
    const { app } = testApp(deadDb);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", database: "unavailable" });
    await app.close();
    await deadDb.destroy();
  });
});
