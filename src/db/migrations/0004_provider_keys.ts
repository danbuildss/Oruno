import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Every provider key a claim has held (rotation creates a new key id). Never the secret.
  await db.schema
    .createTable("provider_keys")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("claim_id", "uuid", (c) => c.notNull().references("claims.id"))
    .addColumn("provider", "text", (c) => c.notNull().check(sql`provider in ('fake', 'surplus')`))
    .addColumn("provider_key_id", "text", (c) => c.notNull())
    .addColumn("key_prefix", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("retired_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("last_spend_micro", "bigint", (c) =>
      c.notNull().defaultTo(0).check(sql`last_spend_micro >= 0`),
    )
    .addColumn("last_synced_at", "timestamptz")
    .addUniqueConstraint("provider_keys_unique", ["provider", "provider_key_id"])
    .execute();
  await db.schema
    .createIndex("provider_keys_claim_idx")
    .on("provider_keys")
    .column("claim_id")
    .execute();

  await db.schema
    .alterTable("claims")
    .addColumn("issue_attempts", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("last_issue_error", "text")
    .addColumn("secret_delivered", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("rotations", "integer", (c) => c.notNull().defaultTo(0).check(sql`rotations >= 0`))
    .addColumn("overshoot_micro", "bigint", (c) =>
      c.notNull().defaultTo(0).check(sql`overshoot_micro >= 0`),
    )
    .execute();

  // A person whose key could never be issued (failed claim) may claim again.
  await sql`alter table claims drop constraint claims_one_per_person_per_drop`.execute(db);
  await sql`
    create unique index claims_one_per_person_per_drop on claims (drop_id, person_id) where status <> 'failed'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index claims_one_per_person_per_drop`.execute(db);
  await sql`
    alter table claims add constraint claims_one_per_person_per_drop unique (drop_id, person_id)
  `.execute(db);
  await db.schema
    .alterTable("claims")
    .dropColumn("issue_attempts")
    .dropColumn("last_issue_error")
    .dropColumn("secret_delivered")
    .dropColumn("rotations")
    .dropColumn("overshoot_micro")
    .execute();
  await db.schema.dropTable("provider_keys").execute();
}
