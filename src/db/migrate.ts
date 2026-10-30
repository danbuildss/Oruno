import {
  type Migration,
  type MigrationProvider,
  type MigrationResultSet,
  Migrator,
} from "kysely/migration";
import type { Db } from "./client.js";
import * as m0001 from "./migrations/0001_operators_and_audit.js";

/**
 * Migrations are listed explicitly (not discovered from the file system) so the same
 * list works from TypeScript sources and from the compiled build. Names sort in order.
 */
const migrations: Record<string, Migration> = {
  "0001_operators_and_audit": m0001,
};

const provider: MigrationProvider = {
  getMigrations: async () => migrations,
};

function migrator(db: Db): Migrator {
  return new Migrator({ db, provider });
}

function unwrap(result: MigrationResultSet): string[] {
  if (result.error) {
    const failed = result.results?.find((r) => r.status === "Error");
    const name = failed ? ` (${failed.migrationName})` : "";
    throw new Error(`Migration failed${name}: ${String(result.error)}`);
  }
  return (result.results ?? []).map((r) => `${r.direction} ${r.migrationName}: ${r.status}`);
}

export async function migrateToLatest(db: Db): Promise<string[]> {
  return unwrap(await migrator(db).migrateToLatest());
}

/** Rolls back every migration, newest first. */
export async function migrateAllDown(db: Db): Promise<string[]> {
  const steps: string[] = [];
  for (;;) {
    const result = await migrator(db).migrateDown();
    const lines = unwrap(result);
    if (lines.length === 0) return steps;
    steps.push(...lines);
  }
}
