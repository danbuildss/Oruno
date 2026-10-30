import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/client.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { createLogger } from "../../src/logger.js";
import { LogCapture } from "../helpers/app.js";
import { freshDb, TEST_DATABASE_URL } from "../helpers/db.js";

describe("job runner (pg-boss on real Postgres)", () => {
  let db: Db;
  let runner: JobRunner;

  beforeAll(async () => {
    db = await freshDb();
    runner = new JobRunner(TEST_DATABASE_URL, createLogger({ level: "info" }, new LogCapture()));
    await runner.start();
  });
  afterAll(async () => {
    await runner.stop();
    await db.destroy();
  });

  it("processes a queued job exactly once", async () => {
    const seen: number[] = [];
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    await runner.register<{ n: number }>("test.echo", async (data) => {
      seen.push(data.n);
      resolveDone();
    });
    const id = await runner.send("test.echo", { n: 42 });
    expect(id).toEqual(expect.any(String));

    await Promise.race([
      done,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("job not processed within 15s")), 15_000),
      ),
    ]);
    // Give the worker a moment to make sure it doesn't run the job twice.
    await new Promise((r) => setTimeout(r, 1_500));
    expect(seen).toEqual([42]);
  });
});
