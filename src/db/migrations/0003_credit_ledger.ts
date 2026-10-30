import { type Kysely, sql } from "kysely";

const TX_HASH = `'^0x[0-9a-f]{64}$'`;

export async function up(db: Kysely<unknown>): Promise<void> {
  // Confirmed deposits backing a drop. The transaction hash is unique: a deposit counts once.
  await db.schema
    .createTable("fundings")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("drop_id", "uuid", (c) => c.notNull().references("drops.id"))
    .addColumn("amount_micro", "bigint", (c) => c.notNull().check(sql`amount_micro > 0`))
    .addColumn("method", "text", (c) => c.notNull().check(sql`method in ('usdc_base')`))
    .addColumn("reference", "text", (c) =>
      c
        .notNull()
        .unique()
        .check(sql.raw(`reference ~ ${TX_HASH}`)),
    )
    .addColumn("note", "text")
    .addColumn("confirmed_by", "uuid", (c) => c.notNull().references("operators.id"))
    .addColumn("confirmed_at", "timestamptz", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // Unallocated funds sent back to the funder after a drop ends.
  await db.schema
    .createTable("fund_returns")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("drop_id", "uuid", (c) => c.notNull().references("drops.id"))
    .addColumn("amount_micro", "bigint", (c) => c.notNull().check(sql`amount_micro > 0`))
    .addColumn("reference", "text", (c) =>
      c
        .notNull()
        .unique()
        .check(sql.raw(`reference ~ ${TX_HASH}`)),
    )
    .addColumn("recorded_by", "uuid", (c) => c.notNull().references("operators.id"))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("ledger_accounts")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (c) =>
      c
        .notNull()
        .check(
          sql`kind in ('funding_source', 'drop_unallocated', 'drop_returned', 'claim_allocated', 'claim_spent')`,
        ),
    )
    .addColumn("drop_id", "uuid", (c) => c.references("drops.id"))
    .addColumn("claim_id", "uuid", (c) => c.references("claims.id"))
    .addColumn("balance_micro", "bigint", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    // Only the external funding source may be negative (it records money coming in).
    .addCheckConstraint(
      "ledger_accounts_non_negative",
      sql`kind = 'funding_source' or balance_micro >= 0`,
    )
    .addCheckConstraint(
      "ledger_accounts_scope",
      sql`(kind = 'funding_source' and drop_id is null and claim_id is null)
        or (kind in ('drop_unallocated', 'drop_returned') and drop_id is not null and claim_id is null)
        or (kind in ('claim_allocated', 'claim_spent') and drop_id is not null and claim_id is not null)`,
    )
    .execute();
  await sql`
    create unique index ledger_accounts_unique on ledger_accounts (kind, drop_id, claim_id) nulls not distinct
  `.execute(db);

  await db.schema
    .createTable("ledger_transactions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (c) =>
      c
        .notNull()
        .check(sql`kind in ('funding', 'claim_allocation', 'claim_release', 'spend', 'return')`),
    )
    .addColumn("drop_id", "uuid", (c) => c.notNull().references("drops.id"))
    .addColumn("claim_id", "uuid", (c) => c.references("claims.id"))
    // Makes each money movement happen at most once, even if retried.
    .addColumn("idempotency_key", "text", (c) => c.notNull().unique())
    .addColumn("memo", "text")
    .addColumn("actor_type", "text", (c) =>
      c.notNull().check(sql`actor_type in ('operator', 'system', 'claimer')`),
    )
    .addColumn("actor_id", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("ledger_entries")
    .addColumn("id", "bigint", (c) => c.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("transaction_id", "uuid", (c) => c.notNull().references("ledger_transactions.id"))
    .addColumn("account_id", "uuid", (c) => c.notNull().references("ledger_accounts.id"))
    .addColumn("amount_micro", "bigint", (c) => c.notNull().check(sql`amount_micro <> 0`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("ledger_entries_transaction_idx")
    .on("ledger_entries")
    .column("transaction_id")
    .execute();
  await db.schema
    .createIndex("ledger_entries_account_idx")
    .on("ledger_entries")
    .column("account_id")
    .execute();

  // --- Rules enforced by the database ---

  // 1. Ledger records are never edited or deleted.
  await sql`
    create function ledger_append_only() returns trigger language plpgsql as $$
    begin
      raise exception '% is append-only', tg_table_name;
    end;
    $$
  `.execute(db);
  for (const table of ["ledger_entries", "ledger_transactions", "fundings", "fund_returns"]) {
    await sql`
      create trigger ${sql.raw(`${table}_append_only`)}
      before update or delete on ${sql.table(table)}
      for each row execute function ledger_append_only()
    `.execute(db);
  }

  // 2. Account balances follow their entries. The non-negative check then refuses overdrafts.
  await sql`
    create function ledger_apply_entry() returns trigger language plpgsql as $$
    begin
      update ledger_accounts set balance_micro = balance_micro + new.amount_micro where id = new.account_id;
      return new;
    end;
    $$
  `.execute(db);
  await sql`
    create trigger ledger_entries_apply after insert on ledger_entries
    for each row execute function ledger_apply_entry()
  `.execute(db);

  // 3. At commit, every transaction has at least two entries and they sum to zero.
  await sql`
    create function ledger_check_transaction_balanced() returns trigger language plpgsql as $$
    declare
      tx uuid := new.transaction_id;
      total numeric;
      n integer;
    begin
      select coalesce(sum(amount_micro), 0), count(*) into total, n from ledger_entries where transaction_id = tx;
      if n < 2 then
        raise exception 'ledger transaction % has % entries; at least 2 required', tx, n;
      end if;
      if total <> 0 then
        raise exception 'ledger transaction % is unbalanced (sum %)', tx, total;
      end if;
      return null;
    end;
    $$
  `.execute(db);
  await sql`
    create function ledger_check_new_transaction() returns trigger language plpgsql as $$
    declare
      total numeric;
      n integer;
    begin
      select coalesce(sum(amount_micro), 0), count(*) into total, n from ledger_entries where transaction_id = new.id;
      if n < 2 then
        raise exception 'ledger transaction % has % entries; at least 2 required', new.id, n;
      end if;
      if total <> 0 then
        raise exception 'ledger transaction % is unbalanced (sum %)', new.id, total;
      end if;
      return null;
    end;
    $$
  `.execute(db);
  await sql`
    create constraint trigger ledger_entries_balanced
    after insert on ledger_entries deferrable initially deferred
    for each row execute function ledger_check_transaction_balanced()
  `.execute(db);
  await sql`
    create constraint trigger ledger_transactions_have_entries
    after insert on ledger_transactions deferrable initially deferred
    for each row execute function ledger_check_new_transaction()
  `.execute(db);

  // The single external funding-source account.
  await sql`insert into ledger_accounts (kind) values ('funding_source')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("ledger_entries").execute();
  await db.schema.dropTable("ledger_transactions").execute();
  await db.schema.dropTable("ledger_accounts").execute();
  await db.schema.dropTable("fund_returns").execute();
  await db.schema.dropTable("fundings").execute();
  for (const fn of [
    "ledger_check_new_transaction",
    "ledger_check_transaction_balanced",
    "ledger_apply_entry",
    "ledger_append_only",
  ]) {
    await sql`drop function if exists ${sql.raw(fn)}()`.execute(db);
  }
}
