import { sql } from "kysely";
import { createDb, type Db } from "../../src/db/client.js";
import { migrateToLatest } from "../../src/db/migrate.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://oruno:oruno@127.0.0.1:5432/oruno_test";

/** Wipes the test database completely (our tables, migration history and job tables). */
export async function resetDatabase(db: Db): Promise<void> {
  await sql`drop schema if exists pgboss cascade`.execute(db);
  await sql`drop schema public cascade`.execute(db);
  await sql`create schema public`.execute(db);
}

/** A fresh, fully migrated test database. */
export async function freshDb(): Promise<Db> {
  const db = createDb(TEST_DATABASE_URL);
  await resetDatabase(db);
  await migrateToLatest(db);
  return db;
}
