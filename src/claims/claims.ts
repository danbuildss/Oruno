import type { Selectable } from "kysely";
import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";
import type { ClaimEndedBy, ClaimsTable } from "../db/schema.js";
import { canTransitionClaim, claimabilityProblem } from "../drops/rules.js";
import { evaluateEligibility } from "../eligibility/eligibility.js";
import { AppError } from "../http/errors.js";
import { allocateForClaim } from "../ledger/ledger.js";

export type ClaimRow = Selectable<ClaimsTable>;

export function claimView(claim: ClaimRow) {
  return {
    id: claim.id,
    dropId: claim.drop_id,
    status: claim.status,
    capMicro: claim.cap_micro.toString(),
    createdAt: claim.created_at.toISOString(),
    endedAt: claim.ended_at ? claim.ended_at.toISOString() : null,
    endReason: claim.end_reason,
  };
}

const PROBLEM_MESSAGES = {
  drop_not_active: "This drop isn't open for claims.",
  drop_not_started: "This drop hasn't started yet.",
  drop_ended: "This drop has ended.",
  drop_full: "All slots in this drop have been claimed.",
} as const;

export interface CreateClaimParams {
  dropSlug: string;
  personId: string;
  identityId: string;
  termsVersion: string;
  now: Date;
}

/**
 * Reserves one slot in a drop for one person.
 *
 * Safety: the drop row is locked (`FOR UPDATE`) for the whole transaction, so concurrent claims
 * are serialised per drop and can't exceed `max_claims`. The unique (drop_id, person_id)
 * constraint is a second, database-level guarantee of one claim per person.
 * The claim's cap is allocated from the drop's funding in the same transaction (Phase 3).
 * The claim stays `pending`; key issuance comes in Phase 4.
 */
export async function createClaim(db: Db, params: CreateClaimParams): Promise<ClaimRow> {
  return db.transaction().execute(async (trx) => {
    const drop = await trx
      .selectFrom("drops")
      .selectAll()
      .where("slug", "=", params.dropSlug)
      .forUpdate()
      .executeTakeFirst();
    if (!drop) throw new AppError(404, "drop_not_found", "Drop not found.");

    if (params.termsVersion !== drop.terms_version) {
      throw new AppError(409, "terms_outdated", "Please accept the current terms for this drop.", {
        termsVersion: drop.terms_version,
      });
    }

    const problem = claimabilityProblem(drop, params.now);
    if (problem) throw new AppError(409, problem, PROBLEM_MESSAGES[problem]);

    const existing = await trx
      .selectFrom("claims")
      .select("id")
      .where("drop_id", "=", drop.id)
      .where("person_id", "=", params.personId)
      .executeTakeFirst();
    if (existing)
      throw new AppError(409, "already_claimed", "You've already claimed from this drop.");

    const identity = await trx
      .selectFrom("identities")
      .select(["account_created_at", "public_repos", "contributions_last_year"])
      .where("id", "=", params.identityId)
      .where("person_id", "=", params.personId)
      .executeTakeFirst();
    if (!identity) throw new AppError(401, "unauthorized", "Please sign in again.");

    const eligibility = evaluateEligibility(
      {
        accountCreatedAt: identity.account_created_at,
        publicRepos: identity.public_repos,
        contributionsLastYear: identity.contributions_last_year,
      },
      {
        minAccountAgeDays: drop.min_account_age_days,
        minPublicRepos: drop.min_public_repos,
        minContributions: drop.min_contributions,
      },
      params.now,
    );
    if (!eligibility.eligible) {
      throw new AppError(
        403,
        "not_eligible",
        "This account doesn't meet the drop's requirements.",
        {
          reasons: eligibility.reasons,
        },
      );
    }

    const claim = await trx
      .insertInto("claims")
      .values({
        drop_id: drop.id,
        person_id: params.personId,
        identity_id: params.identityId,
        cap_micro: drop.cap_micro,
        terms_version: params.termsVersion,
        attested_at: params.now,
        ended_at: null,
        end_reason: null,
        ended_by: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Reserve the claim's cap from the drop's funding. Refused if the drop can't cover it;
    // the whole transaction (claim included) then rolls back.
    await allocateForClaim(trx, {
      dropId: drop.id,
      claimId: claim.id,
      capMicro: claim.cap_micro,
      actor: { type: "claimer", id: params.personId },
    });

    await trx
      .updateTable("drops")
      .set((eb) => ({ claims_count: eb("claims_count", "+", 1), updated_at: params.now }))
      .where("id", "=", drop.id)
      .execute();

    await recordAudit(trx, {
      actorType: "claimer",
      actorId: params.personId,
      action: "claim.created",
      subjectType: "claim",
      subjectId: claim.id,
      details: {
        dropId: drop.id,
        capMicro: claim.cap_micro.toString(),
        termsVersion: params.termsVersion,
      },
    });
    return claim;
  });
}

/**
 * Ends a claim as revoked. A revoked claim keeps its slot: money may already have been spent
 * under it, so the slot is not handed to someone else.
 */
export async function revokeClaim(
  db: Db,
  params: {
    claimId: string;
    by: { type: ClaimEndedBy; id: string };
    reason: string;
    /** For self-revocation: the claim must belong to this person. */
    personId?: string;
    now: Date;
  },
): Promise<ClaimRow> {
  return db.transaction().execute(async (trx) => {
    let query = trx.selectFrom("claims").selectAll().where("id", "=", params.claimId);
    if (params.personId) query = query.where("person_id", "=", params.personId);
    const claim = await query.forUpdate().executeTakeFirst();
    if (!claim) throw new AppError(404, "claim_not_found", "Claim not found.");
    if (!canTransitionClaim(claim.status, "revoked")) {
      throw new AppError(409, "invalid_transition", `A ${claim.status} claim can't be revoked.`);
    }
    const updated = await trx
      .updateTable("claims")
      .set({
        status: "revoked",
        ended_at: params.now,
        end_reason: params.reason,
        ended_by: params.by.type,
        updated_at: params.now,
      })
      .where("id", "=", claim.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      actorType: params.by.type,
      actorId: params.by.id,
      action: "claim.revoked",
      subjectType: "claim",
      subjectId: claim.id,
      details: { from: claim.status, reason: params.reason },
    });
    return updated;
  });
}

/**
 * Ends drops whose window has passed and expires their open claims. Safe to run repeatedly.
 * Returns how many drops and claims it changed.
 */
export async function expireFinishedDrops(
  db: Db,
  now: Date,
): Promise<{ drops: number; claims: number }> {
  return db.transaction().execute(async (trx) => {
    const finished = await trx
      .selectFrom("drops")
      .select(["id", "status"])
      .where("status", "in", ["active", "paused"])
      .where("ends_at", "<=", now)
      .forUpdate()
      .execute();
    let claimsExpired = 0;
    for (const drop of finished) {
      await trx
        .updateTable("drops")
        .set({ status: "ended", updated_at: now })
        .where("id", "=", drop.id)
        .execute();
      const expired = await trx
        .updateTable("claims")
        .set({
          status: "expired",
          ended_at: now,
          end_reason: "drop_ended",
          ended_by: "system",
          updated_at: now,
        })
        .where("drop_id", "=", drop.id)
        .where("status", "in", ["pending", "active"])
        .returning("id")
        .execute();
      claimsExpired += expired.length;
      await recordAudit(trx, {
        actorType: "system",
        action: "drop.ended",
        subjectType: "drop",
        subjectId: drop.id,
        details: {
          from: drop.status,
          to: "ended",
          reason: "window_over",
          claimsExpired: expired.length,
        },
      });
    }
    return { drops: finished.length, claims: claimsExpired };
  });
}
