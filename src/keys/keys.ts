import { sql } from "kysely";
import type { Logger } from "pino";
import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";
import { AppError } from "../http/errors.js";
import { accountId, balanceOf, postTransaction, releaseAllocation } from "../ledger/ledger.js";
import { maxBig, minBig } from "../money.js";
import { type InferenceProvider, ProviderError } from "../providers/provider.js";

export const MAX_ISSUE_ATTEMPTS = 5;
export const MAX_ROTATIONS = 3;

export interface IssuedKey {
  secret: string;
  prefix: string;
  /** What the claimer pastes into their shell to use Claude Code with this key. */
  setup: { ANTHROPIC_BASE_URL: string; ANTHROPIC_AUTH_TOKEN: string; ANTHROPIC_API_KEY: string };
}

function issued(provider: InferenceProvider, secret: string, prefix: string): IssuedKey {
  return {
    secret,
    prefix,
    setup: {
      ANTHROPIC_BASE_URL: provider.claudeCodeBaseUrl,
      ANTHROPIC_AUTH_TOKEN: secret,
      ANTHROPIC_API_KEY: "",
    },
  };
}

function describe(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ProviderError) return { message: error.message, retryable: error.retryable };
  return { message: error instanceof Error ? error.message : "unknown error", retryable: true };
}

/**
 * Turns a pending claim into an active one with a provider key: capped at the claim's cap,
 * expiring when the drop ends, limited to the drop's models.
 *
 * Returns the key (secret shown once) if this call activated the claim, or null if the claim
 * is still pending (will be retried) or failed. The provider call uses the same idempotency key
 * on every attempt, so a retry can't create a second key.
 */
export async function issueKey(
  db: Db,
  provider: InferenceProvider,
  params: { claimId: string; now: Date; logger?: Logger },
): Promise<IssuedKey | null> {
  const claim = await db
    .selectFrom("claims")
    .innerJoin("drops", "drops.id", "claims.drop_id")
    .select([
      "claims.id",
      "claims.status",
      "claims.cap_micro",
      "claims.issue_attempts",
      "drops.ends_at",
      "drops.models",
    ])
    .where("claims.id", "=", params.claimId)
    .executeTakeFirst();
  if (!claim) throw new AppError(404, "claim_not_found", "Claim not found.");
  if (claim.status !== "pending") return null;

  let key: Awaited<ReturnType<InferenceProvider["createKey"]>>;
  try {
    key = await provider.createKey({
      idempotencyKey: `oruno:claim:${claim.id}:create`,
      name: `oruno-claim-${claim.id}`,
      capMicro: claim.cap_micro,
      expiresAt: claim.ends_at,
      models: claim.models,
    });
  } catch (error) {
    const { message, retryable } = describe(error);
    const attempts = claim.issue_attempts + 1;
    params.logger?.warn(
      { claimId: claim.id, attempts, retryable, err: message },
      "key issuance failed",
    );
    if (!retryable || attempts >= MAX_ISSUE_ATTEMPTS) {
      await failClaim(db, { claimId: claim.id, reason: message, now: params.now });
    } else {
      await db
        .updateTable("claims")
        .set({ issue_attempts: attempts, last_issue_error: message, updated_at: params.now })
        .where("id", "=", claim.id)
        .where("status", "=", "pending")
        .execute();
    }
    return null;
  }

  return db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom("claims")
      .select(["status"])
      .where("id", "=", claim.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    // Record the key even if we won't hand it out, so the revocation job can clean it up.
    await trx
      .insertInto("provider_keys")
      .values({
        claim_id: claim.id,
        provider: provider.name,
        provider_key_id: key.keyId,
        key_prefix: key.prefix,
        created_at: params.now,
        retired_at: null,
        revoked_at: null,
      })
      .onConflict((oc) => oc.columns(["provider", "provider_key_id"]).doNothing())
      .execute();
    if (current.status !== "pending") return null;
    await trx
      .updateTable("claims")
      .set({
        status: "active",
        issue_attempts: claim.issue_attempts + 1,
        last_issue_error: null,
        updated_at: params.now,
      })
      .where("id", "=", claim.id)
      .execute();
    await recordAudit(trx, {
      actorType: "system",
      action: "claim.key_issued",
      subjectType: "claim",
      subjectId: claim.id,
      details: { provider: provider.name, keyPrefix: key.prefix },
    });
    return issued(provider, key.secret, key.prefix);
  });
}

/**
 * Marks a pending claim failed, releases its allocation and frees its slot. The person may claim again.
 */
export async function failClaim(
  db: Db,
  params: { claimId: string; reason: string; now: Date },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const claim = await trx
      .selectFrom("claims")
      .select(["id", "drop_id"])
      .where("id", "=", params.claimId)
      .executeTakeFirstOrThrow();
    await trx
      .selectFrom("drops")
      .select("id")
      .where("id", "=", claim.drop_id)
      .forUpdate()
      .execute();
    const updated = await trx
      .updateTable("claims")
      .set({
        status: "failed",
        ended_at: params.now,
        end_reason: "key_issue_failed",
        ended_by: "system",
        last_issue_error: params.reason,
        updated_at: params.now,
      })
      .where("id", "=", claim.id)
      .where("status", "=", "pending")
      .executeTakeFirst();
    if (updated.numUpdatedRows === 0n) return;
    await trx
      .updateTable("drops")
      .set((eb) => ({ claims_count: eb("claims_count", "-", 1), updated_at: params.now }))
      .where("id", "=", claim.drop_id)
      .execute();
    await releaseAllocation(trx, {
      claimId: claim.id,
      dropId: claim.drop_id,
      actor: { type: "system" },
    });
    await recordAudit(trx, {
      actorType: "system",
      action: "claim.failed",
      subjectType: "claim",
      subjectId: claim.id,
      details: { reason: params.reason },
    });
  });
}

/** Retries key issuance for claims left pending (provider outage or a crash mid-claim). */
export async function retryPendingIssuance(
  db: Db,
  provider: InferenceProvider,
  params: { now: Date; olderThanMs?: number; logger?: Logger },
): Promise<{ activated: number; failed: number; stillPending: number }> {
  const cutoff = new Date(params.now.getTime() - (params.olderThanMs ?? 30_000));
  const pending = await db
    .selectFrom("claims")
    .select("id")
    .where("status", "=", "pending")
    .where("updated_at", "<=", cutoff)
    .execute();
  const result = { activated: 0, failed: 0, stillPending: 0 };
  for (const { id } of pending) {
    await issueKey(db, provider, {
      claimId: id,
      now: params.now,
      ...(params.logger ? { logger: params.logger } : {}),
    });
    const after = await db
      .selectFrom("claims")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    if (after.status === "active") result.activated += 1;
    else if (after.status === "failed") result.failed += 1;
    else result.stillPending += 1;
  }
  return result;
}

/**
 * Gives the claimer a new secret for their active claim: the first time for a key the job issued
 * (no secret was delivered), or to replace a lost one. The new key's cap is what's left of the
 * claim's cap, so rotating can never reset the budget. Limited to MAX_ROTATIONS replacements.
 */
export async function revealOrRotateKey(
  db: Db,
  provider: InferenceProvider,
  params: { claimId: string; personId: string; now: Date },
): Promise<IssuedKey> {
  const claim = await db
    .selectFrom("claims")
    .select(["id", "status", "cap_micro", "rotations", "secret_delivered", "person_id"])
    .where("id", "=", params.claimId)
    .where("person_id", "=", params.personId)
    .executeTakeFirst();
  if (!claim) throw new AppError(404, "claim_not_found", "Claim not found.");
  if (claim.status !== "active") {
    throw new AppError(409, "claim_not_active", "Only an active claim has a key.");
  }
  const counts = claim.secret_delivered;
  if (counts && claim.rotations >= MAX_ROTATIONS) {
    throw new AppError(429, "rotation_limit", "This key has been replaced too many times.");
  }
  const current = await db
    .selectFrom("provider_keys")
    .select(["provider_key_id"])
    .where("claim_id", "=", claim.id)
    .where("retired_at", "is", null)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  if (!current) throw new AppError(409, "claim_not_active", "Only an active claim has a key.");

  // Bring spend up to date so the new key gets exactly what's left.
  await syncClaimSpend(db, provider, { claimId: claim.id, now: params.now });
  const spent = await totalProviderSpend(db, claim.id);
  const remaining = claim.cap_micro - spent;
  if (remaining <= 0n)
    throw new AppError(409, "claim_exhausted", "This claim's credit is used up.");

  const sequence = claim.rotations + (counts ? 1 : 0);
  let key: Awaited<ReturnType<InferenceProvider["rotateKey"]>>;
  try {
    key = await provider.rotateKey({
      keyId: current.provider_key_id,
      capMicro: remaining,
      idempotencyKey: `oruno:claim:${claim.id}:rotate:${sequence}`,
    });
  } catch (error) {
    throw new AppError(
      502,
      "provider_unavailable",
      "Couldn't issue a new key right now. Try again shortly.",
      {
        cause: describe(error).message,
      },
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx.selectFrom("claims").select("id").where("id", "=", claim.id).forUpdate().execute();
    await trx
      .updateTable("provider_keys")
      .set({ retired_at: params.now, revoked_at: params.now })
      .where("claim_id", "=", claim.id)
      .where("provider_key_id", "=", current.provider_key_id)
      .execute();
    await trx
      .insertInto("provider_keys")
      .values({
        claim_id: claim.id,
        provider: provider.name,
        provider_key_id: key.keyId,
        key_prefix: key.prefix,
        created_at: params.now,
        retired_at: null,
        revoked_at: null,
      })
      .onConflict((oc) => oc.columns(["provider", "provider_key_id"]).doNothing())
      .execute();
    await trx
      .updateTable("claims")
      .set({ secret_delivered: true, rotations: sequence, updated_at: params.now })
      .where("id", "=", claim.id)
      .execute();
    await recordAudit(trx, {
      actorType: "claimer",
      actorId: params.personId,
      action: counts ? "claim.key_rotated" : "claim.key_revealed",
      subjectType: "claim",
      subjectId: claim.id,
      details: { keyPrefix: key.prefix, remainingMicro: remaining.toString() },
    });
  });
  return issued(provider, key.secret, key.prefix);
}

export async function markSecretDelivered(db: Db, claimId: string): Promise<void> {
  await db
    .updateTable("claims")
    .set({ secret_delivered: true })
    .where("id", "=", claimId)
    .execute();
}

const ENDED = ["revoked", "expired", "failed", "exhausted"] as const;

/** Revokes, at the provider, every key whose claim has ended. Safe to run repeatedly. */
export async function revokeEndedKeys(
  db: Db,
  provider: InferenceProvider,
  params: { now: Date; logger?: Logger },
): Promise<{ revoked: number; failed: number }> {
  const keys = await db
    .selectFrom("provider_keys")
    .innerJoin("claims", "claims.id", "provider_keys.claim_id")
    .select(["provider_keys.id", "provider_keys.provider_key_id", "provider_keys.claim_id"])
    .where("provider_keys.revoked_at", "is", null)
    .where("provider_keys.provider", "=", provider.name)
    .where("claims.status", "in", [...ENDED])
    .execute();
  let revoked = 0;
  let failed = 0;
  for (const k of keys) {
    try {
      await provider.revokeKey({
        keyId: k.provider_key_id,
        idempotencyKey: `oruno:key:${k.provider_key_id}:revoke`,
      });
      await db
        .updateTable("provider_keys")
        .set({ revoked_at: params.now })
        .where("id", "=", k.id)
        .execute();
      await recordAudit(db, {
        actorType: "system",
        action: "provider_key.revoked",
        subjectType: "claim",
        subjectId: k.claim_id,
        details: { provider: provider.name },
      });
      revoked += 1;
    } catch (error) {
      failed += 1;
      params.logger?.warn(
        { claimId: k.claim_id, err: describe(error).message },
        "provider key revocation failed",
      );
    }
  }
  return { revoked, failed };
}

async function totalProviderSpend(db: Db, claimId: string): Promise<bigint> {
  const row = await db
    .selectFrom("provider_keys")
    .select(sql<string>`coalesce(sum(last_spend_micro), 0)`.as("total"))
    .where("claim_id", "=", claimId)
    .executeTakeFirstOrThrow();
  return BigInt(row.total);
}

/**
 * Reads cumulative spend for every key a claim has held and records any increase in the ledger
 * (claim_allocated → claim_spent). The ledger never records more than the cap; spend beyond it
 * is stored as overshoot and flagged. Concurrent syncs serialise on the claim row and post once.
 */
export async function syncClaimSpend(
  db: Db,
  provider: InferenceProvider,
  params: { claimId: string; now: Date; logger?: Logger },
): Promise<{ recordedMicro: bigint; overshootMicro: bigint }> {
  const keys = await db
    .selectFrom("provider_keys")
    .select(["id", "provider_key_id"])
    .where("claim_id", "=", params.claimId)
    .where("provider", "=", provider.name)
    .execute();
  const readings = new Map<string, bigint>();
  for (const k of keys) {
    readings.set(k.id, await provider.getKeySpend(k.provider_key_id));
  }

  return db.transaction().execute(async (trx) => {
    const claim = await trx
      .selectFrom("claims")
      .select(["id", "drop_id", "status", "cap_micro", "overshoot_micro"])
      .where("id", "=", params.claimId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    for (const [id, spent] of readings) {
      // Spend only ever goes up; ignore a stale lower reading.
      await trx
        .updateTable("provider_keys")
        .set({
          last_spend_micro: sql`greatest(last_spend_micro, ${spent.toString()}::bigint)`,
          last_synced_at: params.now,
        })
        .where("id", "=", id)
        .execute();
    }
    const total = BigInt(
      (
        await trx
          .selectFrom("provider_keys")
          .select(sql<string>`coalesce(sum(last_spend_micro), 0)`.as("total"))
          .where("claim_id", "=", claim.id)
          .executeTakeFirstOrThrow()
      ).total,
    );

    const spentId = await accountId(trx, "claim_spent", {
      dropId: claim.drop_id,
      claimId: claim.id,
    });
    const allocatedId = await accountId(trx, "claim_allocated", {
      dropId: claim.drop_id,
      claimId: claim.id,
    });
    const recorded = await balanceOf(trx, spentId);
    const allocated = await balanceOf(trx, allocatedId);
    const target = minBig(total, claim.cap_micro);
    const wanted = target - recorded;
    const posted = wanted > 0n ? minBig(wanted, allocated) : 0n;
    if (posted > 0n) {
      await postTransaction(trx, {
        kind: "spend",
        dropId: claim.drop_id,
        claimId: claim.id,
        idempotencyKey: `spend:${claim.id}:${(recorded + posted).toString()}`,
        memo: "provider usage",
        actor: { type: "system" },
        entries: [
          { accountId: allocatedId, amountMicro: -posted },
          { accountId: spentId, amountMicro: posted },
        ],
      });
    }

    const overshoot = total - (recorded + posted);
    const newOvershoot = overshoot > 0n ? overshoot : 0n;
    if (newOvershoot > claim.overshoot_micro) {
      await recordAudit(trx, {
        actorType: "system",
        action: "claim.overshoot",
        subjectType: "claim",
        subjectId: claim.id,
        details: { overshootMicro: newOvershoot.toString(), providerSpendMicro: total.toString() },
      });
      params.logger?.error(
        { claimId: claim.id, overshootMicro: newOvershoot.toString() },
        "provider spend exceeded what the ledger could record (overshoot)",
      );
    }
    const exhausted = claim.status === "active" && recorded + posted >= claim.cap_micro;
    await trx
      .updateTable("claims")
      .set({
        overshoot_micro: maxBig(newOvershoot, claim.overshoot_micro),
        ...(exhausted
          ? {
              status: "exhausted",
              ended_at: params.now,
              end_reason: "cap_reached",
              ended_by: "system",
            }
          : {}),
        updated_at: params.now,
      })
      .where("id", "=", claim.id)
      .execute();
    if (exhausted) {
      await recordAudit(trx, {
        actorType: "system",
        action: "claim.exhausted",
        subjectType: "claim",
        subjectId: claim.id,
      });
    }
    return { recordedMicro: posted, overshootMicro: newOvershoot };
  });
}

/**
 * Syncs spend for active claims and for ended claims that still hold an allocation
 * (their final usage must be recorded before release).
 */
export async function syncAllSpend(
  db: Db,
  provider: InferenceProvider,
  params: { now: Date; logger?: Logger },
): Promise<{ claims: number; recordedMicro: bigint; errors: number }> {
  const claims = await db
    .selectFrom("claims")
    .leftJoin("ledger_accounts", (join) =>
      join
        .onRef("ledger_accounts.claim_id", "=", "claims.id")
        .on("ledger_accounts.kind", "=", "claim_allocated"),
    )
    .select("claims.id")
    .where((eb) =>
      eb.or([
        eb("claims.status", "=", "active"),
        eb.and([
          eb("claims.status", "in", [...ENDED]),
          eb("ledger_accounts.balance_micro", ">", 0n),
        ]),
      ]),
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("provider_keys")
          .select("provider_keys.id")
          .whereRef("provider_keys.claim_id", "=", "claims.id"),
      ),
    )
    .execute();
  let recorded = 0n;
  let errors = 0;
  for (const { id } of claims) {
    try {
      recorded += (
        await syncClaimSpend(db, provider, {
          claimId: id,
          now: params.now,
          ...(params.logger ? { logger: params.logger } : {}),
        })
      ).recordedMicro;
    } catch (error) {
      errors += 1;
      params.logger?.warn({ claimId: id, err: describe(error).message }, "spend sync failed");
    }
  }
  return { claims: claims.length, recordedMicro: recorded, errors };
}

/**
 * Second safety layer (D-003, D-019): the provider-side ceiling on total spend equals the funds
 * currently held for drops (funded − returned).
 */
export async function syncSpendCeiling(db: Db, provider: InferenceProvider): Promise<bigint> {
  const row = await sql<{ held: string }>`
    select (
      (select coalesce(sum(amount_micro), 0) from fundings) -
      (select coalesce(sum(amount_micro), 0) from fund_returns)
    )::text as held
  `.execute(db);
  const held = BigInt(row.rows[0]?.held ?? "0");
  await provider.setSpendCeiling({
    limitMicro: held,
    idempotencyKey: `oruno:ceiling:${held.toString()}`,
  });
  return held;
}
