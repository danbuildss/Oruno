import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  completeGitHubSignIn,
  OAUTH_STATE_TTL_MS,
  revokeClaimerSession,
  startGitHubSignIn,
} from "../../auth/claimer-auth.js";
import type { Db } from "../../db/client.js";
import type { GitHubClient } from "../../github/client.js";
import {
  claimerOf,
  requireClaimer,
  type SessionCookieOptions,
  sessionCookieName,
} from "../claimer-auth.js";
import { AppError } from "../errors.js";

const SLUG = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const startQuery = z.object({ drop: z.string().regex(SLUG).optional() });
const callbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(512),
});
const githubErrorQuery = z.object({ error: z.string().min(1).max(100) });

/** Sign-in routes are rate-limited per IP to slow down automated account farming. */
const SIGN_IN_RATE_LIMIT = { max: 20, timeWindow: "1 minute" };

/** Remembers which pool page to return to if sign-in fails (no secret; just a slug). */
const RETURN_COOKIE = "oruno_return";

/**
 * A browser navigating to these routes asks for HTML; API clients and tests don't.
 * Browsers get redirects and a session cookie; API clients get JSON with a bearer token.
 */
function isBrowser(request: FastifyRequest): boolean {
  return (request.headers.accept ?? "").includes("text/html");
}

function poolPath(slug: string | null | undefined): string {
  return slug && SLUG.test(slug) ? `/p/${slug}` : "/credit";
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: Db; github: GitHubClient | null; clock: () => Date; cookie: SessionCookieOptions },
): void {
  const cookieName = sessionCookieName(deps.cookie);
  const githubOrUnavailable = (): GitHubClient => {
    if (!deps.github) {
      throw new AppError(503, "github_not_configured", "GitHub sign-in isn't configured.");
    }
    return deps.github;
  };

  /** Sends a browser back to the pool page with an error code it can explain. */
  const browserError = (request: FastifyRequest, reply: FastifyReply, code: string) => {
    const back = request.cookies?.[RETURN_COOKIE];
    reply.clearCookie(RETURN_COOKIE, { path: "/" });
    return reply.redirect(`${poolPath(back)}?error=${encodeURIComponent(code)}`, 303);
  };

  app.get(
    "/v1/auth/github/start",
    { config: { rateLimit: SIGN_IN_RATE_LIMIT } },
    async (request, reply) => {
      const github = githubOrUnavailable();
      const { drop } = startQuery.parse(request.query);
      const result = await startGitHubSignIn(deps.db, github, {
        dropSlug: drop ?? null,
        now: deps.clock(),
      });
      if (!isBrowser(request)) return result;
      if (drop) {
        reply.setCookie(RETURN_COOKIE, drop, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: deps.cookie.secure,
          maxAge: OAUTH_STATE_TTL_MS / 1000,
        });
      }
      return reply.redirect(result.authorizeUrl, 303);
    },
  );

  app.get(
    "/v1/auth/github/callback",
    { config: { rateLimit: SIGN_IN_RATE_LIMIT } },
    async (request, reply) => {
      const browser = isBrowser(request);
      // The person pressed "Cancel" on GitHub (or GitHub refused): no code is sent.
      const denied = githubErrorQuery.safeParse(request.query);
      if (denied.success && !("code" in (request.query as object))) {
        if (browser) return browserError(request, reply, "github_denied");
        throw new AppError(400, "github_denied", "GitHub sign-in was cancelled or refused.");
      }
      try {
        const github = githubOrUnavailable();
        const { code, state } = callbackQuery.parse(request.query);
        const result = await completeGitHubSignIn(deps.db, github, {
          code,
          state,
          now: deps.clock(),
        });
        if (!browser) {
          return {
            sessionToken: result.sessionToken,
            expiresAt: result.expiresAt.toISOString(),
            login: result.login,
            drop: result.dropSlug,
          };
        }
        reply.clearCookie(RETURN_COOKIE, { path: "/" });
        reply.setCookie(cookieName, result.sessionToken, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: deps.cookie.secure,
          expires: result.expiresAt,
        });
        return reply.redirect(poolPath(result.dropSlug), 303);
      } catch (error) {
        if (!browser) throw error;
        request.log.warn({ err: error }, "browser sign-in failed");
        const code = error instanceof AppError ? error.code : "sign_in_failed";
        return browserError(request, reply, code);
      }
    },
  );

  const claimer = requireClaimer(deps.db, deps.clock, deps.cookie);

  app.post("/v1/auth/sign-out", { preHandler: claimer }, async (request, reply) => {
    await revokeClaimerSession(deps.db, claimerOf(request).sessionId, deps.clock());
    reply.clearCookie(cookieName, { path: "/", secure: deps.cookie.secure });
    return reply.status(204).send();
  });

  /** Who is signed in (the website uses this to choose what to show). */
  app.get("/v1/me", { preHandler: claimer }, async (request) => {
    const session = claimerOf(request);
    const identity = await deps.db
      .selectFrom("identities")
      .select(["login", "provider"])
      .where("id", "=", session.identityId)
      .executeTakeFirstOrThrow();
    return { login: identity.login, provider: identity.provider };
  });
}
