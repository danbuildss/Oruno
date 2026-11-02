import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema.js";

// Postgres BIGINT (int8, OID 20) arrives as a string by default. Money is stored as
// bigint micro-dollars, so parse it as a JavaScript bigint, never as a float.
pg.types.setTypeParser(20, (value: string) => BigInt(value));

export type Db = Kysely<Database>;

export interface DbOptions {
  maxConnections?: number;
  /** A query running longer than this is cancelled (default 15 s). */
  statementTimeoutMs?: number;
  /** Waiting longer than this for a row lock fails the query (default 5 s). */
  lockTimeoutMs?: number;
}

export function createDb(databaseUrl: string, options: DbOptions = {}): Db {
  const statementTimeout = options.statementTimeoutMs ?? 15_000;
  const lockTimeout = options.lockTimeoutMs ?? 5_000;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000,
    // Nothing may hang forever: every session gets a statement and lock timeout.
    options: `-c statement_timeout=${statementTimeout} -c lock_timeout=${lockTimeout}`,
  });
  // A connection dropped by the server (failover, restart, network) must never crash the process.
  // Idle connections report through the pool; connections in use report on the client itself.
  // The query in progress still fails normally (and is answered with a retryable 503).
  pool.on("error", () => undefined);
  pool.on("connect", (client) => {
    client.on("error", () => undefined);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
