import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { expireFinishedDrops } from "./claims/claims.js";
import { ConfigError, loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { pendingMigrations } from "./db/migrate.js";
import { HttpGitHubClient } from "./github/client.js";
import { JobRunner } from "./jobs/runner.js";
import {
  retryPendingIssuance,
  revokeEndedKeys,
  revokeOrphanKeys,
  syncAllSpend,
  syncSpendCeiling,
} from "./keys/keys.js";
import { checkLedgerInvariants, releaseEndedClaims } from "./ledger/ledger.js";
import { createLogger } from "./logger.js";
import { FakeProvider } from "./providers/fake.js";
import type { InferenceProvider } from "./providers/provider.js";
import { SurplusProvider } from "./providers/surplus.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === "development" });
  const db = createDb(config.databaseUrl);
  const pending = await pendingMigrations(db);
  if (pending.length > 0) {
    await db.destroy();
    throw new Error(
      `Database migrations are pending (${pending.join(", ")}). Run \`pnpm migrate\` first.`,
    );
  }
  const jobs = new JobRunner(config.databaseUrl, logger);
  const github = config.github ? new HttpGitHubClient(config.github) : null;
  if (!github) logger.warn("GitHub sign-in is not configured; sign-in routes will return 503");
  const provider: InferenceProvider | null =
    config.provider.kind === "surplus"
      ? new SurplusProvider({
          adminKey: config.provider.adminKey,
          workspaceId: config.provider.workspaceId,
          ...(config.provider.baseUrl ? { baseUrl: config.provider.baseUrl } : {}),
        })
      : config.provider.kind === "fake"
        ? new FakeProvider()
        : null;
  if (!provider) logger.warn("No provider configured; claims can't be issued keys");
  if (provider?.name === "fake")
    logger.warn("Using the FAKE provider: keys are not real (development only)");
  const webDistDir = resolve(config.webDistDir ?? "web/dist");
  const hasWeb = existsSync(resolve(webDistDir, "index.html"));
  if (!hasWeb) logger.warn("Claim website not built (web/dist missing); serving the API only");
  const app = await buildApp({
    db,
    logger,
    github,
    provider,
    secureCookies: config.nodeEnv === "production",
    webDistDir: hasWeb ? webDistDir : null,
  });

  await jobs.start();
  await jobs.register("drops.expire", async () => {
    const result = await expireFinishedDrops(db, new Date());
    if (result.drops > 0) logger.info(result, "expired finished drops");
  });
  await jobs.schedule("drops.expire", "* * * * *");
  await jobs.register("claims.release", async () => {
    // Record final usage before handing unused allocation back to the drop.
    if (provider) await syncAllSpend(db, provider, { now: new Date(), logger });
    const result = await releaseEndedClaims(db, new Date());
    if (result.claims > 0) {
      logger.info(
        { claims: result.claims, releasedMicro: result.releasedMicro.toString() },
        "released ended claims",
      );
    }
  });
  await jobs.schedule("claims.release", "*/5 * * * *");
  await jobs.register("ledger.check", async () => {
    const violations = await checkLedgerInvariants(db);
    if (violations.length > 0) logger.error({ violations }, "LEDGER INVARIANT VIOLATION");
    else logger.info("ledger invariants hold");
  });
  await jobs.schedule("ledger.check", "17 * * * *");
  if (provider) {
    await jobs.register("keys.issue_pending", async () => {
      const r = await retryPendingIssuance(db, provider, { now: new Date(), logger });
      if (r.activated + r.failed + r.stillPending > 0)
        logger.info(r, "retried pending key issuance");
    });
    await jobs.schedule("keys.issue_pending", "* * * * *");
    await jobs.register("keys.revoke_ended", async () => {
      const r = await revokeEndedKeys(db, provider, { now: new Date(), logger });
      if (r.revoked + r.failed > 0) logger.info(r, "revoked ended keys at provider");
    });
    await jobs.schedule("keys.revoke_ended", "* * * * *");
    await jobs.register("spend.sync", async () => {
      const r = await syncAllSpend(db, provider, { now: new Date(), logger });
      logger.info(
        { claims: r.claims, recordedMicro: r.recordedMicro.toString(), errors: r.errors },
        "spend synced",
      );
    });
    await jobs.schedule("spend.sync", "*/5 * * * *");
    await jobs.register("spend.ceiling", async () => {
      const held = await syncSpendCeiling(db, provider);
      logger.info({ ceilingMicro: held.toString() }, "spend ceiling synced");
    });
    await jobs.schedule("spend.ceiling", "23 * * * *");
    await jobs.register("keys.reconcile", async () => {
      const r = await revokeOrphanKeys(db, provider, { now: new Date(), logger });
      if (r.revoked > 0) logger.warn(r, "revoked orphaned provider keys");
    });
    await jobs.schedule("keys.reconcile", "*/15 * * * *");
  }
  await app.listen({ host: config.host, port: config.port });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    await app.close();
    await jobs.stop();
    await db.destroy();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error("Failed to start:", error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
