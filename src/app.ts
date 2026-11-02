import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { Db } from "./db/client.js";
import type { GitHubClient } from "./github/client.js";
import { AppError, registerErrorHandling } from "./http/errors.js";
import { registerAuthRoutes } from "./http/routes/auth.js";
import { registerClaimRoutes } from "./http/routes/claims.js";
import { registerDropRoutes } from "./http/routes/drops.js";
import { registerHealthRoutes } from "./http/routes/health.js";
import { registerLedgerRoutes } from "./http/routes/ledger.js";
import { registerOperatorRoutes } from "./http/routes/operator.js";
import type { InferenceProvider } from "./providers/provider.js";

export interface AppDeps {
  db: Db;
  logger: Logger;
  /** GitHub sign-in client; null when GitHub isn't configured. */
  github?: GitHubClient | null;
  /** Where keys come from; null when no provider is configured. */
  provider?: InferenceProvider | null;
  /** Source of "now"; injectable so tests can control time. */
  clock?: () => Date;
}

/** Builds the HTTP app without listening, so tests can drive it with `app.inject`. */
export async function buildApp({
  db,
  logger,
  github = null,
  provider = null,
  clock = () => new Date(),
}: AppDeps): Promise<FastifyInstance> {
  const loggerInstance: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance,
    bodyLimit: 64 * 1024,
  });

  registerErrorHandling(app);
  // Rate limits apply only to routes that opt in (sign-in and claim routes).
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "rate_limited", `Too many requests. Try again in ${context.after}.`),
  });

  registerHealthRoutes(app, db);
  registerOperatorRoutes(app, db);
  registerAuthRoutes(app, { db, github, clock });
  registerDropRoutes(app, { db, clock });
  registerClaimRoutes(app, { db, clock, provider, logger });
  registerLedgerRoutes(app, { db, clock, provider, logger });

  return app;
}
