import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema.js";

// Postgres BIGINT (int8, OID 20) arrives as a string by default. Money is stored as
// bigint micro-dollars, so parse it as a JavaScript bigint, never as a float.
pg.types.setTypeParser(20, (value: string) => BigInt(value));

export type Db = Kysely<Database>;

export function createDb(databaseUrl: string, options: { maxConnections?: number } = {}): Db {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
