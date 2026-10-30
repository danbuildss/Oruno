import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Db } from "../../src/db/client.js";
import { AppError } from "../../src/http/errors.js";
import { testApp } from "../helpers/app.js";
import { freshDb } from "../helpers/db.js";

// These routes exist only in tests, to exercise the shared error handling.
function appWithTestRoutes(db: Db) {
  const { app, logs } = testApp(db);
  const body = z.object({ name: z.string().min(1), amount: z.number().int().positive() });
  app.post("/test/validate", async (request) => body.parse(request.body));
  app.get("/test/app-error", async () => {
    throw new AppError(409, "conflict", "Already exists.", { field: "name" });
  });
  app.get("/test/crash", async () => {
    throw new Error("database password is hunter2");
  });
  return { app, logs };
}

describe("error handling", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it("returns a structured 404 for unknown routes", async () => {
    const { app } = appWithTestRoutes(db);
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: "not_found" },
      requestId: expect.any(String),
    });
    await app.close();
  });

  it("returns 400 with field details for invalid input", async () => {
    const { app } = appWithTestRoutes(db);
    const res = await app.inject({
      method: "POST",
      url: "/test/validate",
      payload: { name: "", amount: 1.5 },
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.error.code).toBe("validation_error");
    expect(json.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      "amount",
      "name",
    ]);
    await app.close();
  });

  it("returns 400 for malformed JSON", async () => {
    const { app } = appWithTestRoutes(db);
    const res = await app.inject({
      method: "POST",
      url: "/test/validate",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("bad_request");
    await app.close();
  });

  it("passes through AppError status, code and details", async () => {
    const { app } = appWithTestRoutes(db);
    const res = await app.inject({ method: "GET", url: "/test/app-error" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({
      code: "conflict",
      message: "Already exists.",
      details: { field: "name" },
    });
    await app.close();
  });

  it("hides internal error details from the caller", async () => {
    const { app } = appWithTestRoutes(db);
    const res = await app.inject({ method: "GET", url: "/test/crash" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({ code: "internal_error", message: "Something went wrong." });
    expect(res.body).not.toContain("hunter2");
    await app.close();
  });
});
