import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { claimView, createClaim, revokeClaim } from "../../claims/claims.js";
import type { Db } from "../../db/client.js";
import { claimerOf, requireClaimer } from "../claimer-auth.js";
import { AppError } from "../errors.js";
import { requireOperator } from "../operator-auth.js";

const slugParams = z.object({ slug: z.string().min(1).max(64) });
const idParams = z.object({ id: z.uuid() });

/** The claimer must explicitly confirm each of these (claimer terms §3). */
const claimBody = z.object({
  termsVersion: z.string().min(1).max(40),
  acceptTerms: z.literal(true),
  confirmAdult: z.literal(true),
  confirmNotSanctioned: z.literal(true),
});
const revokeBody = z.object({ reason: z.string().trim().min(1).max(200) });

const CLAIM_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export function registerClaimRoutes(
  app: FastifyInstance,
  deps: { db: Db; clock: () => Date },
): void {
  const claimer = requireClaimer(deps.db, deps.clock);
  const operator = requireOperator(deps.db);

  app.post(
    "/v1/drops/:slug/claims",
    { preHandler: claimer, config: { rateLimit: CLAIM_RATE_LIMIT } },
    async (request, reply) => {
      const { slug } = slugParams.parse(request.params);
      const body = claimBody.parse(request.body);
      const session = claimerOf(request);
      const claim = await createClaim(deps.db, {
        dropSlug: slug,
        personId: session.personId,
        identityId: session.identityId,
        termsVersion: body.termsVersion,
        now: deps.clock(),
      });
      return reply.status(201).send(claimView(claim));
    },
  );

  app.get("/v1/me/claims", { preHandler: claimer }, async (request) => {
    const session = claimerOf(request);
    const claims = await deps.db
      .selectFrom("claims")
      .selectAll()
      .where("person_id", "=", session.personId)
      .orderBy("created_at", "desc")
      .execute();
    return { claims: claims.map(claimView) };
  });

  app.post("/v1/me/claims/:id/revoke", { preHandler: claimer }, async (request) => {
    const { id } = idParams.parse(request.params);
    const session = claimerOf(request);
    const claim = await revokeClaim(deps.db, {
      claimId: id,
      personId: session.personId,
      by: { type: "claimer", id: session.personId },
      reason: "revoked_by_claimer",
      now: deps.clock(),
    });
    return claimView(claim);
  });

  app.post("/v1/claims/:id/revoke", { preHandler: operator }, async (request) => {
    const { id } = idParams.parse(request.params);
    const { reason } = revokeBody.parse(request.body);
    if (!request.operator)
      throw new AppError(401, "unauthorized", "An operator API key is required.");
    const claim = await revokeClaim(deps.db, {
      claimId: id,
      by: { type: "operator", id: request.operator.id },
      reason,
      now: deps.clock(),
    });
    return claimView(claim);
  });
}
