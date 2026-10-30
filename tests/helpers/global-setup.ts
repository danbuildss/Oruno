import pg from "pg";
import { TEST_DATABASE_URL } from "./db.js";

// Fail fast with a clear message if the test database isn't reachable.
export default async function setup(): Promise<void> {
  const client = new pg.Client({
    connectionString: TEST_DATABASE_URL,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    throw new Error(
      `Test database is not reachable at TEST_DATABASE_URL. Start Postgres (see README) and create the test database.\nCause: ${String(error)}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
