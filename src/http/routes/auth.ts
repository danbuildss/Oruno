import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  completeGitHubSignIn,
  revokeClaimerSession,
  startGitHubSignIn,
} from "../../auth/claimer-auth.js";
import type { Db } from "../../db/client.js";
import type { GitHubClient } from "../../github/client.js";
import { claimerOf, requireClaimer } from "../claimer-auth.js";
import { AppError } from "../errors.js";

const startQuery = z.object({
  drop: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/)
    .optional(),
});
const callbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(512),
});

/** Sign-in routes are rate-limited per IP to slow down automated account farming. */
const SIGN_IN_RATE_LIMIT = { max: 20, timeWindow: "1 minute" };

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: Db; github: GitHubClient | null; clock: () => Date },
): void {
  const githubOrUnavailable = (): GitHubClient => {
    if (!deps.github) {
      throw new AppError(503, "github_not_configured", "GitHub sign-in isn't configured.");
    }
    return deps.github;
  };

  app.get(
    "/v1/auth/github/start",
    { config: { rateLimit: SIGN_IN_RATE_LIMIT } },
    async (request) => {
      const github = githubOrUnavailable();
      const { drop } = startQuery.parse(request.query);
      return startGitHubSignIn(deps.db, github, { dropSlug: drop ?? null, now: deps.clock() });
    },
  );

  app.get(
    "/v1/auth/github/callback",
    { config: { rateLimit: SIGN_IN_RATE_LIMIT } },
    async (request) => {
      const github = githubOrUnavailable();
      const { code, state } = callbackQuery.parse(request.query);
      const result = await completeGitHubSignIn(deps.db, github, {
        code,
        state,
        now: deps.clock(),
      });
      return {
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt.toISOString(),
        login: result.login,
        drop: result.dropSlug,
      };
    },
  );

  app.post(
    "/v1/auth/sign-out",
    { preHandler: requireClaimer(deps.db, deps.clock) },
    async (request, reply) => {
      await revokeClaimerSession(deps.db, claimerOf(request).sessionId, deps.clock());
      return reply.status(204).send();
    },
  );
}
