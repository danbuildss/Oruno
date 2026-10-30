import { type Kysely, sql, type Transaction } from "kysely";
import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";
import type {
  AuditActorType,
  Database,
  LedgerAccountKind,
  LedgerTransactionKind,
} from "../db/schema.js";
import { AppError } from "../http/errors.js";

type Trx = Transaction<Database> | Kysely<Database>;

export interface Actor {
  type: AuditActorType;
  id?: string | null;
}

/** Returns the id of a ledger account, creating it on first use. */
export async function accountId(
  trx: Trx,
  kind: LedgerAccountKind,
  scope: { dropId?: string; claimId?: string } = {},
): Promise<string> {
  const dropId = scope.dropId ?? null;
  const claimId = scope.claimId ?? null;
  await trx
    .insertInto("ledger_accounts")
    .values({ kind, drop_id: dropId, claim_id: claimId, created_at: undefined })
    .onConflict((oc) => oc.columns(["kind", "drop_id", "claim_id"]).doNothing())
    .execute();
  let query = trx.selectFrom("ledger_accounts").select("id").where("kind", "=", kind);
  query =
    dropId === null ? query.where("drop_id", "is", null) : query.where("drop_id", "=", dropId);
  query =
    claimId === null ? query.where("claim_id", "is", null) : query.where("claim_id", "=", claimId);
  return (await query.executeTakeFirstOrThrow()).id;
}

export async function balanceOf(trx: Trx, accountIdValue: string): Promise<bigint> {
  const row = await trx
    .selectFrom("ledger_accounts")
    .select("balance_micro")
    .where("id", "=", accountIdValue)
    .executeTakeFirstOrThrow();
  return row.balance_micro;
}

export interface PostTransactionInput {
  kind: LedgerTransactionKind;
  dropId: string;
  claimId?: string | null;
  idempotencyKey: string;
  memo?: string | null;
  actor: Actor;
  entries: Array<{ accountId: string; amountMicro: bigint }>;
}

/**
 * Posts one balanced ledger transaction. Returns false (and posts nothing) if a transaction with
 * the same idempotency key already exists. The database independently refuses unbalanced
 * transactions and overdrawn accounts.
 */
export async function postTransaction(trx: Trx, input: PostTransactionInput): Promise<boolean> {
  const total = input.entries.reduce((sum, e) => sum + e.amountMicro, 0n);
  if (input.entries.length < 2 || total !== 0n || input.entries.some((e) => e.amountMicro === 0n)) {
    throw new Error(`Refusing to post an unbalanced or empty ledger transaction (${input.kind}).`);
  }
  const inserted = await trx
    .insertInto("ledger_transactions")
    .values({
      kind: input.kind,
      drop_id: input.dropId,
      claim_id: input.claimId ?? null,
      idempotency_key: input.idempotencyKey,
      memo: input.memo ?? null,
      actor_type: input.actor.type,
      actor_id: input.actor.id ?? null,
      created_at: undefined,
    })
    .onConflict((oc) => oc.column("idempotency_key").doNothing())
    .returning("id")
    .executeTakeFirst();
  if (!inserted) return false;
  await trx
    .insertInto("ledger_entries")
    .values(
      input.entries.map((e) => ({
        transaction_id: inserted.id,
        account_id: e.accountId,
        amount_micro: e.amountMicro,
        created_at: undefined,
      })),
    )
    .execute();
  return true;
}

export interface DropBalances {
  funded: bigint;
  unallocated: bigint;
  allocated: bigint;
  spent: bigint;
  returned: bigint;
}

export async function dropBalances(trx: Trx, dropId: string): Promise<DropBalances> {
  const rows = await trx
    .selectFrom("ledger_accounts")
    .select(["kind", sql<string>`sum(balance_micro)`.as("total")])
    .where("drop_id", "=", dropId)
    .groupBy("kind")
    .execute();
  const byKind = new Map(rows.map((r) => [r.kind, BigInt(r.total)]));
  const funded = await trx
    .selectFrom("fundings")
    .select(sql<string>`coalesce(sum(amount_micro), 0)`.as("total"))
    .where("drop_id", "=", dropId)
    .executeTakeFirstOrThrow();
  return {
    funded: BigInt(funded.total),
    unallocated: byKind.get("drop_unallocated") ?? 0n,
    allocated: byKind.get("claim_allocated") ?? 0n,
    spent: byKind.get("claim_spent") ?? 0n,
    returned: byKind.get("drop_returned") ?? 0n,
  };
}

export function balancesView(b: DropBalances) {
  return {
    fundedMicro: b.funded.toString(),
    unallocatedMicro: b.unallocated.toString(),
    allocatedMicro: b.allocated.toString(),
    spentMicro: b.spent.toString(),
    returnedMicro: b.returned.toString(),
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505" &&
    String((error as { constraint?: string }).constraint ?? "").includes(constraint)
  );
}

/** Records a confirmed USDC-on-Base deposit and credits the drop. */
export async function recordFunding(
  db: Db,
  params: {
    dropId: string;
    amountMicro: bigint;
    reference: string;
    note: string | null;
    operatorId: string;
    now: Date;
  },
) {
  try {
    return await db.transaction().execute(async (trx) => {
      const drop = await trx
        .selectFrom("drops")
        .select(["id", "status"])
        .where("id", "=", params.dropId)
        .forUpdate()
        .executeTakeFirst();
      if (!drop) throw new AppError(404, "drop_not_found", "Drop not found.");
      if (drop.status === "ended") {
        throw new AppError(409, "drop_ended", "An ended drop can't receive funding.");
      }
      const funding = await trx
        .insertInto("fundings")
        .values({
          drop_id: drop.id,
          amount_micro: params.amountMicro,
          method: "usdc_base",
          reference: params.reference,
          note: params.note,
          confirmed_by: params.operatorId,
          confirmed_at: params.now,
          created_at: undefined,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await postTransaction(trx, {
        kind: "funding",
        dropId: drop.id,
        idempotencyKey: `funding:${funding.id}`,
        memo: `USDC on Base ${params.reference}`,
        actor: { type: "operator", id: params.operatorId },
        entries: [
          { accountId: await accountId(trx, "funding_source"), amountMicro: -params.amountMicro },
          {
            accountId: await accountId(trx, "drop_unallocated", { dropId: drop.id }),
            amountMicro: params.amountMicro,
          },
        ],
      });
      await recordAudit(trx, {
        actorType: "operator",
        actorId: params.operatorId,
        action: "drop.funded",
        subjectType: "drop",
        subjectId: drop.id,
        details: { amountMicro: params.amountMicro.toString(), reference: params.reference },
      });
      return { funding, balances: await dropBalances(trx, drop.id) };
    });
  } catch (error) {
    if (isUniqueViolation(error, "reference")) {
      throw new AppError(409, "duplicate_reference", "This deposit has already been recorded.");
    }
    throw error;
  }
}

/**
 * Moves a claim's cap from the drop's unallocated funds to the claim.
 * Must run inside the claim-creating transaction, with the drop row already locked.
 */
export async function allocateForClaim(
  trx: Transaction<Database>,
  params: { dropId: string; claimId: string; capMicro: bigint; actor: Actor },
): Promise<void> {
  const unallocatedId = await accountId(trx, "drop_unallocated", { dropId: params.dropId });
  const available = await balanceOf(trx, unallocatedId);
  if (available < params.capMicro) {
    throw new AppError(409, "insufficient_funding", "This drop doesn't have enough funding left.");
  }
  await postTransaction(trx, {
    kind: "claim_allocation",
    dropId: params.dropId,
    claimId: params.claimId,
    idempotencyKey: `claim_allocation:${params.claimId}`,
    actor: params.actor,
    entries: [
      { accountId: unallocatedId, amountMicro: -params.capMicro },
      {
        accountId: await accountId(trx, "claim_allocated", {
          dropId: params.dropId,
          claimId: params.claimId,
        }),
        amountMicro: params.capMicro,
      },
    ],
  });
}

/** Funds needed for the slots a drop still offers. */
export function requiredForOpenSlots(drop: {
  cap_micro: bigint;
  max_claims: number;
  claims_count: number;
}): bigint {
  return drop.cap_micro * BigInt(drop.max_claims - drop.claims_count);
}

const TERMINAL_CLAIM_STATUSES = ["revoked", "expired", "failed", "exhausted"] as const;

/**
 * Returns an ended claim's unused allocation to the drop. Idempotent: a second call finds
 * nothing left to release. Locks the drop row first, the same order as claim creation.
 */
export async function releaseClaim(
  db: Db,
  params: { claimId: string; actor: Actor },
): Promise<{ releasedMicro: bigint }> {
  return db.transaction().execute(async (trx) => {
    const claim = await trx
      .selectFrom("claims")
      .select(["id", "drop_id", "status"])
      .where("id", "=", params.claimId)
      .executeTakeFirst();
    if (!claim) throw new AppError(404, "claim_not_found", "Claim not found.");
    await trx
      .selectFrom("drops")
      .select("id")
      .where("id", "=", claim.drop_id)
      .forUpdate()
      .execute();
    const current = await trx
      .selectFrom("claims")
      .select("status")
      .where("id", "=", claim.id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (!(TERMINAL_CLAIM_STATUSES as readonly string[]).includes(current.status)) {
      throw new AppError(
        409,
        "claim_still_open",
        "Only an ended claim's allocation can be released.",
      );
    }
    return releaseAllocation(trx, {
      claimId: claim.id,
      dropId: claim.drop_id,
      actor: params.actor,
    });
  });
}

/**
 * Moves whatever is left of a claim's allocation back to the drop. Caller must hold the drop
 * row lock and have checked the claim is terminal. Idempotent per claim.
 */
export async function releaseAllocation(
  trx: Transaction<Database>,
  params: { claimId: string; dropId: string; actor: Actor },
): Promise<{ releasedMicro: bigint }> {
  const allocatedId = await accountId(trx, "claim_allocated", {
    dropId: params.dropId,
    claimId: params.claimId,
  });
  const remaining = await balanceOf(trx, allocatedId);
  if (remaining === 0n) return { releasedMicro: 0n };
  await postTransaction(trx, {
    kind: "claim_release",
    dropId: params.dropId,
    claimId: params.claimId,
    idempotencyKey: `claim_release:${params.claimId}`,
    actor: params.actor,
    entries: [
      { accountId: allocatedId, amountMicro: -remaining },
      {
        accountId: await accountId(trx, "drop_unallocated", { dropId: params.dropId }),
        amountMicro: remaining,
      },
    ],
  });
  await recordAudit(trx, {
    actorType: params.actor.type,
    actorId: params.actor.id ?? null,
    action: "claim.released",
    subjectType: "claim",
    subjectId: params.claimId,
    details: { releasedMicro: remaining.toString() },
  });
  return { releasedMicro: remaining };
}

/** Default wait after a claim ends before releasing its allocation (lets final usage arrive first). */
export const RELEASE_GRACE_MS = 60 * 60 * 1000;

/** Releases every ended claim older than the grace period that still holds an allocation. */
export async function releaseEndedClaims(
  db: Db,
  now: Date,
  graceMs: number = RELEASE_GRACE_MS,
): Promise<{ claims: number; releasedMicro: bigint }> {
  const candidates = await db
    .selectFrom("claims")
    .innerJoin("ledger_accounts", (join) =>
      join
        .onRef("ledger_accounts.claim_id", "=", "claims.id")
        .on("ledger_accounts.kind", "=", "claim_allocated"),
    )
    .select("claims.id")
    .where("claims.status", "in", [...TERMINAL_CLAIM_STATUSES])
    .where("claims.ended_at", "<=", new Date(now.getTime() - graceMs))
    .where("ledger_accounts.balance_micro", ">", 0n)
    .execute();
  let released = 0n;
  let count = 0;
  for (const { id } of candidates) {
    const result = await releaseClaim(db, { claimId: id, actor: { type: "system" } });
    if (result.releasedMicro > 0n) {
      released += result.releasedMicro;
      count += 1;
    }
  }
  return { claims: count, releasedMicro: released };
}

/** Records unallocated funds sent back to the funder after a drop has ended. */
export async function recordReturn(
  db: Db,
  params: {
    dropId: string;
    amountMicro: bigint | null;
    reference: string;
    operatorId: string;
  },
) {
  try {
    return await db.transaction().execute(async (trx) => {
      const drop = await trx
        .selectFrom("drops")
        .select(["id", "status"])
        .where("id", "=", params.dropId)
        .forUpdate()
        .executeTakeFirst();
      if (!drop) throw new AppError(404, "drop_not_found", "Drop not found.");
      if (drop.status !== "ended") {
        throw new AppError(409, "drop_not_ended", "Funds can only be returned after a drop ends.");
      }
      const already = await trx
        .selectFrom("fund_returns")
        .select("id")
        .where("reference", "=", params.reference)
        .executeTakeFirst();
      if (already)
        throw new AppError(409, "duplicate_reference", "This return has already been recorded.");
      const unallocatedId = await accountId(trx, "drop_unallocated", { dropId: drop.id });
      const available = await balanceOf(trx, unallocatedId);
      const amount = params.amountMicro ?? available;
      if (amount <= 0n)
        throw new AppError(409, "nothing_to_return", "There are no unallocated funds to return.");
      if (amount > available) {
        throw new AppError(
          409,
          "insufficient_funding",
          "That's more than the drop's unallocated funds.",
          {
            unallocatedMicro: available.toString(),
          },
        );
      }
      const fundReturn = await trx
        .insertInto("fund_returns")
        .values({
          drop_id: drop.id,
          amount_micro: amount,
          reference: params.reference,
          recorded_by: params.operatorId,
          created_at: undefined,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await postTransaction(trx, {
        kind: "return",
        dropId: drop.id,
        idempotencyKey: `return:${fundReturn.id}`,
        memo: `Returned via ${params.reference}`,
        actor: { type: "operator", id: params.operatorId },
        entries: [
          { accountId: unallocatedId, amountMicro: -amount },
          {
            accountId: await accountId(trx, "drop_returned", { dropId: drop.id }),
            amountMicro: amount,
          },
        ],
      });
      await recordAudit(trx, {
        actorType: "operator",
        actorId: params.operatorId,
        action: "drop.funds_returned",
        subjectType: "drop",
        subjectId: drop.id,
        details: { amountMicro: amount.toString(), reference: params.reference },
      });
      return { fundReturn, balances: await dropBalances(trx, drop.id) };
    });
  } catch (error) {
    if (isUniqueViolation(error, "reference")) {
      throw new AppError(409, "duplicate_reference", "This return has already been recorded.");
    }
    throw error;
  }
}

export interface InvariantViolation {
  check: string;
  subject: string;
  detail: string;
}

/**
 * Recomputes the ledger from scratch and compares it with stored balances and source records.
 * An empty result means every invariant holds.
 */
export async function checkLedgerInvariants(db: Db): Promise<InvariantViolation[]> {
  const violations: InvariantViolation[] = [];

  const drift = await sql<{ id: string; stored: string; computed: string }>`
    select a.id, a.balance_micro::text as stored, coalesce(sum(e.amount_micro), 0)::text as computed
    from ledger_accounts a left join ledger_entries e on e.account_id = a.id
    group by a.id having a.balance_micro <> coalesce(sum(e.amount_micro), 0)
  `.execute(db);
  for (const r of drift.rows) {
    violations.push({
      check: "account_balance_matches_entries",
      subject: `account:${r.id}`,
      detail: `stored ${r.stored}, entries sum ${r.computed}`,
    });
  }

  const unbalanced = await sql<{ id: string; total: string; n: string }>`
    select t.id, coalesce(sum(e.amount_micro), 0)::text as total, count(e.id)::text as n
    from ledger_transactions t left join ledger_entries e on e.transaction_id = t.id
    group by t.id having coalesce(sum(e.amount_micro), 0) <> 0 or count(e.id) < 2
  `.execute(db);
  for (const r of unbalanced.rows) {
    violations.push({
      check: "transaction_balanced",
      subject: `transaction:${r.id}`,
      detail: `sum ${r.total} over ${r.n} entries`,
    });
  }

  const negative = await sql<{ id: string; balance: string }>`
    select id, balance_micro::text as balance from ledger_accounts
    where kind <> 'funding_source' and balance_micro < 0
  `.execute(db);
  for (const r of negative.rows) {
    violations.push({
      check: "non_negative_balance",
      subject: `account:${r.id}`,
      detail: r.balance,
    });
  }

  const dropTotals = await sql<{
    drop_id: string;
    funded: string;
    held: string;
    returned_ledger: string;
    returned_records: string;
  }>`
    select d.id as drop_id,
      (select coalesce(sum(amount_micro), 0) from fundings f where f.drop_id = d.id)::text as funded,
      (select coalesce(sum(balance_micro), 0) from ledger_accounts a where a.drop_id = d.id)::text as held,
      (select coalesce(sum(balance_micro), 0) from ledger_accounts a where a.drop_id = d.id and a.kind = 'drop_returned')::text as returned_ledger,
      (select coalesce(sum(amount_micro), 0) from fund_returns r where r.drop_id = d.id)::text as returned_records
    from drops d
  `.execute(db);
  for (const r of dropTotals.rows) {
    if (r.funded !== r.held) {
      violations.push({
        check: "drop_funds_conserved",
        subject: `drop:${r.drop_id}`,
        detail: `funded ${r.funded} but accounts hold ${r.held}`,
      });
    }
    if (r.returned_ledger !== r.returned_records) {
      violations.push({
        check: "returns_match_records",
        subject: `drop:${r.drop_id}`,
        detail: `ledger ${r.returned_ledger}, records ${r.returned_records}`,
      });
    }
  }

  const source = await sql<{ balance: string; funded: string }>`
    select
      (select coalesce(sum(balance_micro), 0) from ledger_accounts where kind = 'funding_source')::text as balance,
      (select coalesce(sum(amount_micro), 0) from fundings)::text as funded
  `.execute(db);
  const s = source.rows[0];
  if (s && BigInt(s.balance) !== -BigInt(s.funded)) {
    violations.push({
      check: "funding_source_matches_fundings",
      subject: "funding_source",
      detail: `balance ${s.balance}, total funded ${s.funded}`,
    });
  }

  const overCap = await sql<{ claim_id: string; used: string; cap: string }>`
    select c.id as claim_id, coalesce(sum(a.balance_micro), 0)::text as used, c.cap_micro::text as cap
    from claims c left join ledger_accounts a on a.claim_id = c.id
    group by c.id having coalesce(sum(a.balance_micro), 0) > c.cap_micro
  `.execute(db);
  for (const r of overCap.rows) {
    violations.push({
      check: "claim_within_cap",
      subject: `claim:${r.claim_id}`,
      detail: `allocated + spent ${r.used} exceeds cap ${r.cap}`,
    });
  }

  const openUnfunded = await sql<{ claim_id: string; allocated: string; cap: string }>`
    select c.id as claim_id, coalesce(a.balance_micro, 0)::text as allocated, c.cap_micro::text as cap
    from claims c left join ledger_accounts a on a.claim_id = c.id and a.kind = 'claim_allocated'
    where c.status in ('pending', 'active')
      and coalesce(a.balance_micro, 0) + coalesce((select balance_micro from ledger_accounts s where s.claim_id = c.id and s.kind = 'claim_spent'), 0) <> c.cap_micro
  `.execute(db);
  for (const r of openUnfunded.rows) {
    violations.push({
      check: "open_claim_fully_backed",
      subject: `claim:${r.claim_id}`,
      detail: `allocated ${r.allocated} for cap ${r.cap}`,
    });
  }

  return violations;
}
