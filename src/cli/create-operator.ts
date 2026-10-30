import { createOperator } from "../auth/operator-keys.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";

// Usage: pnpm operator:create "Dan"
// Prints the new operator key ONCE. Store it in a password manager; it cannot be recovered.
async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) throw new Error('Usage: pnpm operator:create "<name>"');
  const db = createDb(loadConfig().databaseUrl, { maxConnections: 1 });
  try {
    const { operator, key } = await createOperator(db, name);
    console.log(`Operator created: ${operator.name} (${operator.id})`);
    console.log(`API key (shown once, not stored): ${key}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
