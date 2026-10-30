import type { FastifyReply, FastifyRequest } from "fastify";
import { type ClaimerSession, findClaimerSession } from "../auth/claimer-auth.js";
import type { Db } from "../db/client.js";
import { AppError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    claimer?: ClaimerSession;
  }
}

/** Returns a preHandler that requires `Authorization: Bearer <claimer session token>`. */
export function requireClaimer(db: Db, clock: () => Date) {
  return async function claimerAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const match = request.headers.authorization?.match(/^Bearer (\S+)$/);
    const session = match?.[1] ? await findClaimerSession(db, match[1], clock()) : null;
    if (!session) {
      throw new AppError(401, "unauthorized", "Please sign in with GitHub.");
    }
    request.claimer = session;
  };
}

export function claimerOf(request: FastifyRequest): ClaimerSession {
  if (!request.claimer) throw new AppError(401, "unauthorized", "Please sign in with GitHub.");
  return request.claimer;
}
