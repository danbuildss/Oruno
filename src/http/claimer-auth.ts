import type { FastifyReply, FastifyRequest } from "fastify";
import { type ClaimerSession, findClaimerSession } from "../auth/claimer-auth.js";
import type { Db } from "../db/client.js";
import { AppError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    claimer?: ClaimerSession;
  }
}

/** Cookie settings for the claim website's session (D-023). */
export interface SessionCookieOptions {
  /** True in production: the cookie is `Secure` and uses the `__Host-` prefix. */
  secure: boolean;
}

export function sessionCookieName(options: SessionCookieOptions): string {
  // `__Host-` cookies must be Secure, Path=/ and have no Domain: they can't be set or
  // overwritten by a subdomain or over plain HTTP.
  return options.secure ? "__Host-oruno_session" : "oruno_session";
}

/** The header a cookie-authenticated request that changes anything must carry. */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "oruno";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Returns a preHandler that requires a claimer session, either as
 * `Authorization: Bearer <token>` (API clients, tests) or as the website's session cookie.
 *
 * Cookie-authenticated requests that change state must carry `X-Requested-With: oruno`.
 * A cross-site form or image can't set that header, and a cross-site `fetch` with it
 * needs a CORS preflight that Oruno never approves. SameSite=Lax is the second layer.
 */
export function requireClaimer(db: Db, clock: () => Date, cookie: SessionCookieOptions) {
  const cookieName = sessionCookieName(cookie);
  return async function claimerAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const bearer = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const fromCookie = bearer ? undefined : request.cookies?.[cookieName];
    const token = bearer ?? fromCookie;
    const session = token ? await findClaimerSession(db, token, clock()) : null;
    if (!session) {
      throw new AppError(401, "unauthorized", "Please sign in with GitHub.");
    }
    if (fromCookie && !SAFE_METHODS.has(request.method)) {
      if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
        throw new AppError(403, "csrf_check_failed", "This request wasn't sent by the Oruno site.");
      }
    }
    request.claimer = session;
  };
}

export function claimerOf(request: FastifyRequest): ClaimerSession {
  if (!request.claimer) throw new AppError(401, "unauthorized", "Please sign in with GitHub.");
  return request.claimer;
}
