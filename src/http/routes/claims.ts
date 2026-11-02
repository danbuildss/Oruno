import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import type { Logger } from "pino";
import { z } from "zod";
import { claimView, createClaim, revokeClaim } from "../../claims/claims.js";
import type { Db } from "../../db/client.js";
import {
  issueKey,
  markSecretDelivered,
  revealOrRotateKey,
  revokeEndedKeys,
} from "../../keys/keys.js";
import type { InferenceProvider } from "../../providers/provider.js";
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
const KEY_RATE_LIMIT = { max: 5, timeWindow: "1 minute" };

/** Spend recorded in the ledger and the current key prefix, per claim. */
async function claimExtras(db: Db, claimIds: string[]) {
  if (claimIds.length === 0)
    return new Map<string, { spentMicro: bigint; keyPrefix: string | null }>();
  const rows = await db
    .selectFrom("claims")
    .leftJoin("ledger_accounts", (join) =>
      join
        .onRef("ledger_accounts.claim_id", "=", "claims.id")
        .on("ledger_accounts.kind", "=", "claim_spent"),
    )
    .select([
      "claims.id",
      sql<string>`coalesce(ledger_accounts.balance_micro, 0)::text`.as("spent"),
      (eb) =>
        eb
          .selectFrom("provider_keys")
          .select("key_prefix")
          .whereRef("provider_keys.claim_id", "=", "claims.id")
          .where("provider_keys.retired_at", "is", null)
          .orderBy("provider_keys.created_at", "desc")
          .limit(1)
          .as("keyPrefix"),
    ])
    .where("claims.id", "in", claimIds)
    .execute();
  return new Map(
    rows.map((r) => [r.id, { spentMicro: BigInt(r.spent), keyPrefix: r.keyPrefix ?? null }]),
  );
}

export function registerClaimRoutes(
  app: FastifyInstance,
  deps: { db: Db; clock: () => Date; provider: InferenceProvider | null; logger: Logger },
): void {
  const claimer = requireClaimer(deps.db, deps.clock);
  const operator = requireOperator(deps.db);
  const providerOrUnavailable = (): InferenceProvider => {
    if (!deps.provider) {
      throw new AppError(503, "provider_not_configured", "Keys can't be issued right now.");
    }
    return deps.provider;
  };

  app.post(
    "/v1/drops/:slug/claims",
    { preHandler: claimer, config: { rateLimit: CLAIM_RATE_LIMIT } },
    async (request, reply) => {
      const provider = providerOrUnavailable();
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
      const key = await issueKey(deps.db, provider, {
        claimId: claim.id,
        now: deps.clock(),
        logger: deps.logger,
      });
      const current = await deps.db
        .selectFrom("claims")
        .selectAll()
        .where("id", "=", claim.id)
        .executeTakeFirstOrThrow();
      if (key) {
        await markSecretDelivered(deps.db, claim.id);
        return reply.status(201).send({ claim: claimView(current), key });
      }
      if (current.status === "failed") {
        throw new AppError(
          502,
          "key_issue_failed",
          "Your key couldn't be issued. Please try claiming again.",
        );
      }
      // Still pending: the provider is temporarily unavailable; a job keeps trying.
      return reply.status(202).send({
        claim: claimView(current),
        key: null,
        message:
          "Your slot is reserved. Your key is being issued; fetch it shortly from /v1/me/claims/:id/key.",
      });
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
    const extras = await claimExtras(
      deps.db,
      claims.map((c) => c.id),
    );
    return { claims: claims.map((c) => claimView(c, extras.get(c.id) ?? {})) };
  });

  // Get the key for an active claim (first time after a delayed issuance), or replace a lost one.
  app.post(
    "/v1/me/claims/:id/key",
    { preHandler: claimer, config: { rateLimit: KEY_RATE_LIMIT } },
    async (request) => {
      const provider = providerOrUnavailable();
      const { id } = idParams.parse(request.params);
      const session = claimerOf(request);
      const key = await revealOrRotateKey(deps.db, provider, {
        claimId: id,
        personId: session.personId,
        now: deps.clock(),
      });
      return { key };
    },
  );

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
    if (deps.provider)
      await revokeEndedKeys(deps.db, deps.provider, { now: deps.clock(), logger: deps.logger });
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
    if (deps.provider)
      await revokeEndedKeys(deps.db, deps.provider, { now: deps.clock(), logger: deps.logger });
    return claimView(claim);
  });
}
