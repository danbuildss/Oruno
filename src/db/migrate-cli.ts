import { loadConfig } from "../config.js";
import { createDb } from "./client.js";
import { migrateAllDown, migrateToLatest } from "./migrate.js";

// Usage: pnpm migrate        (apply all pending migrations)
//        pnpm migrate down   (roll back every migration — development only)
async function main(): Promise<void> {
  const direction = process.argv[2] ?? "up";
  const config = loadConfig();
  if (direction === "down" && config.nodeEnv === "production") {
    throw new Error("Refusing to roll back all migrations in production.");
  }
  const db = createDb(config.databaseUrl, { maxConnections: 1 });
  try {
    const steps = direction === "down" ? await migrateAllDown(db) : await migrateToLatest(db);
    console.log(steps.length ? steps.join("\n") : "Nothing to do.");
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
