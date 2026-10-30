import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { Db } from "./db/client.js";
import { registerErrorHandling } from "./http/errors.js";
import { registerHealthRoutes } from "./http/routes/health.js";
import { registerOperatorRoutes } from "./http/routes/operator.js";

export interface AppDeps {
  db: Db;
  logger: Logger;
}

/** Builds the HTTP app without listening, so tests can drive it with `app.inject`. */
export function buildApp({ db, logger }: AppDeps): FastifyInstance {
  const loggerInstance: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance,
    bodyLimit: 64 * 1024,
  });

  registerErrorHandling(app);
  registerHealthRoutes(app, db);
  registerOperatorRoutes(app, db);

  return app;
}
