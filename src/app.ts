import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
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
  /** True in production: session cookies are Secure with the `__Host-` prefix. */
  secureCookies?: boolean;
  /** Absolute path of the built claim website (`web/dist`); null to serve the API only. */
  webDistDir?: string | null;
}

/**
 * Content Security Policy for the claim website: only Oruno's own scripts, styles and API.
 * No inline scripts, no third-party code, and the site can't be framed.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Builds the HTTP app without listening, so tests can drive it with `app.inject`. */
export async function buildApp({
  db,
  logger,
  github = null,
  provider = null,
  clock = () => new Date(),
  secureCookies = false,
  webDistDir = null,
}: AppDeps): Promise<FastifyInstance> {
  const loggerInstance: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance,
    bodyLimit: 64 * 1024,
    // A slow or stuck client can't hold a connection forever.
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 10_000,
  });

  registerErrorHandling(app, { spaFallback: webDistDir !== null });
  await app.register(cookie);

  // Security headers on every response. API responses may contain a key secret: never cache.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("content-security-policy", CSP);
    if (secureCookies) {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    if (!request.url.startsWith("/assets/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  if (webDistDir !== null) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      // Only real files are served; unknown paths fall through to the SPA fallback.
      wildcard: false,
      index: false,
      // Vite puts hashed, immutable files in /assets.
      setHeaders: (reply, path) => {
        if (path.includes("/assets/")) {
          reply.header("cache-control", "public, max-age=31536000, immutable");
        }
      },
    });
  }
  // Rate limits apply only to routes that opt in (sign-in and claim routes).
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "rate_limited", `Too many requests. Try again in ${context.after}.`),
  });

  registerHealthRoutes(app, db);
  registerOperatorRoutes(app, db);
  const cookieOptions = { secure: secureCookies };
  registerAuthRoutes(app, { db, github, clock, cookie: cookieOptions });
  registerDropRoutes(app, { db, clock });
  registerClaimRoutes(app, { db, clock, provider, logger, cookie: cookieOptions });
  registerLedgerRoutes(app, { db, clock, provider, logger });

  return app;
}
