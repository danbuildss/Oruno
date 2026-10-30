import type { Selectable } from "kysely";
import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";
import type { DropStatus, DropsTable } from "../db/schema.js";
import { AppError } from "../http/errors.js";
import { accountId, balanceOf, requiredForOpenSlots } from "../ledger/ledger.js";
import { type CreateDropInput, canTransitionDrop } from "./rules.js";

export type DropRow = Selectable<DropsTable>;

/** The public view of a drop (no internal ids of operators). */
export function dropView(drop: DropRow) {
  return {
    id: drop.id,
    slug: drop.slug,
    name: drop.name,
    status: drop.status,
    capMicro: drop.cap_micro.toString(),
    maxClaims: drop.max_claims,
    claimsCount: drop.claims_count,
    slotsLeft: drop.max_claims - drop.claims_count,
    models: drop.models,
    startsAt: drop.starts_at.toISOString(),
    endsAt: drop.ends_at.toISOString(),
    termsVersion: drop.terms_version,
    eligibility: {
      minAccountAgeDays: drop.min_account_age_days,
      minPublicRepos: drop.min_public_repos,
      minContributions: drop.min_contributions,
    },
  };
}

export async function createDrop(
  db: Db,
  input: CreateDropInput,
  operatorId: string,
): Promise<DropRow> {
  return db.transaction().execute(async (trx) => {
    const taken = await trx
      .selectFrom("drops")
      .select("id")
      .where("slug", "=", input.slug)
      .executeTakeFirst();
    if (taken) throw new AppError(409, "slug_taken", "A drop with this slug already exists.");
    const drop = await trx
      .insertInto("drops")
      .values({
        slug: input.slug,
        name: input.name,
        cap_micro: input.capMicro,
        max_claims: input.maxClaims,
        models: input.models,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        min_account_age_days: input.eligibility.minAccountAgeDays,
        min_public_repos: input.eligibility.minPublicRepos,
        min_contributions: input.eligibility.minContributions,
        terms_version: input.termsVersion,
        created_by: operatorId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      actorType: "operator",
      actorId: operatorId,
      action: "drop.created",
      subjectType: "drop",
      subjectId: drop.id,
      details: { slug: drop.slug, capMicro: drop.cap_micro.toString(), maxClaims: drop.max_claims },
    });
    return drop;
  });
}

export async function getDrop(
  db: Db,
  idOrSlug: { id: string } | { slug: string },
): Promise<DropRow> {
  let query = db.selectFrom("drops").selectAll();
  query =
    "id" in idOrSlug
      ? query.where("id", "=", idOrSlug.id)
      : query.where("slug", "=", idOrSlug.slug);
  const drop = await query.executeTakeFirst();
  if (!drop) throw new AppError(404, "drop_not_found", "Drop not found.");
  return drop;
}

export async function listDrops(db: Db): Promise<DropRow[]> {
  return db.selectFrom("drops").selectAll().orderBy("created_at", "desc").execute();
}

/** Changes a drop's status under a row lock, if the transition is allowed. */
export async function transitionDrop(
  db: Db,
  params: {
    dropId: string;
    to: DropStatus;
    actor: { type: "operator" | "system"; id?: string };
    now: Date;
  },
): Promise<DropRow> {
  return db.transaction().execute(async (trx) => {
    const drop = await trx
      .selectFrom("drops")
      .selectAll()
      .where("id", "=", params.dropId)
      .forUpdate()
      .executeTakeFirst();
    if (!drop) throw new AppError(404, "drop_not_found", "Drop not found.");
    if (!canTransitionDrop(drop.status, params.to)) {
      throw new AppError(
        409,
        "invalid_transition",
        `A ${drop.status} drop can't become ${params.to}.`,
      );
    }
    if (params.to === "active" && params.now.getTime() >= drop.ends_at.getTime()) {
      throw new AppError(409, "drop_window_over", "This drop's window has already ended.");
    }
    if (params.to === "active") {
      // A live drop must be able to pay for every slot it still offers.
      const required = requiredForOpenSlots(drop);
      const available = await balanceOf(
        trx,
        await accountId(trx, "drop_unallocated", { dropId: drop.id }),
      );
      if (available < required) {
        throw new AppError(409, "insufficient_funding", "Fund this drop before opening it.", {
          requiredMicro: required.toString(),
          unallocatedMicro: available.toString(),
        });
      }
    }
    const updated = await trx
      .updateTable("drops")
      .set({ status: params.to, updated_at: params.now })
      .where("id", "=", drop.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      actorType: params.actor.type,
      actorId: params.actor.id ?? null,
      action: `drop.${params.to}`,
      subjectType: "drop",
      subjectId: drop.id,
      details: { from: drop.status, to: params.to },
    });
    return updated;
  });
}
