import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // A person may link several sign-in identities; claims are limited per person.
  await db.schema
    .createTable("people")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("blocked_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("identities")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("person_id", "uuid", (c) => c.notNull().references("people.id"))
    .addColumn("provider", "text", (c) => c.notNull().check(sql`provider in ('github')`))
    .addColumn("provider_user_id", "text", (c) => c.notNull())
    .addColumn("login", "text", (c) => c.notNull())
    .addColumn("account_created_at", "timestamptz", (c) => c.notNull())
    .addColumn("public_repos", "integer", (c) => c.notNull().check(sql`public_repos >= 0`))
    .addColumn("followers", "integer", (c) => c.notNull().check(sql`followers >= 0`))
    .addColumn("contributions_last_year", "integer", (c) =>
      c.check(sql`contributions_last_year >= 0`),
    )
    .addColumn("signals_checked_at", "timestamptz", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("identities_provider_user_unique", ["provider", "provider_user_id"])
    .execute();
  await db.schema
    .createIndex("identities_person_idx")
    .on("identities")
    .column("person_id")
    .execute();

  // OAuth sign-in attempts: single-use, short-lived. Only a hash of `state` is stored.
  await db.schema
    .createTable("oauth_states")
    .addColumn("state_hash", "text", (c) =>
      c.primaryKey().check(sql`state_hash ~ '^[0-9a-f]{64}$'`),
    )
    .addColumn("provider", "text", (c) => c.notNull().check(sql`provider in ('github')`))
    .addColumn("code_verifier", "text", (c) => c.notNull())
    .addColumn("drop_slug", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("used_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("claimer_sessions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("person_id", "uuid", (c) => c.notNull().references("people.id"))
    .addColumn("identity_id", "uuid", (c) => c.notNull().references("identities.id"))
    .addColumn("token_hash", "text", (c) =>
      c.notNull().unique().check(sql`token_hash ~ '^[0-9a-f]{64}$'`),
    )
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (c) => c.notNull())
    .addColumn("revoked_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("drops")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("slug", "text", (c) =>
      c.notNull().unique().check(sql`slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'`),
    )
    .addColumn("name", "text", (c) => c.notNull().check(sql`length(trim(name)) > 0`))
    .addColumn("status", "text", (c) =>
      c.notNull().defaultTo("draft").check(sql`status in ('draft', 'active', 'paused', 'ended')`),
    )
    .addColumn("cap_micro", "bigint", (c) => c.notNull().check(sql`cap_micro > 0`))
    .addColumn("max_claims", "integer", (c) =>
      c.notNull().check(sql`max_claims between 1 and 10000`),
    )
    .addColumn("claims_count", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("models", sql`text[]`, (c) => c.notNull().check(sql`cardinality(models) > 0`))
    .addColumn("starts_at", "timestamptz", (c) => c.notNull())
    .addColumn("ends_at", "timestamptz", (c) => c.notNull())
    .addColumn("min_account_age_days", "integer", (c) =>
      c.notNull().check(sql`min_account_age_days >= 0`),
    )
    .addColumn("min_public_repos", "integer", (c) => c.notNull().check(sql`min_public_repos >= 0`))
    .addColumn("min_contributions", "integer", (c) =>
      c.notNull().check(sql`min_contributions >= 0`),
    )
    .addColumn("terms_version", "text", (c) => c.notNull())
    .addColumn("created_by", "uuid", (c) => c.notNull().references("operators.id"))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "drops_claims_within_slots",
      sql`claims_count >= 0 and claims_count <= max_claims`,
    )
    .addCheckConstraint("drops_window_valid", sql`ends_at > starts_at`)
    // Provider budgets reset monthly (TH-4), so a drop must start and end in the same UTC month.
    .addCheckConstraint(
      "drops_window_one_month",
      sql`date_trunc('month', starts_at at time zone 'UTC') = date_trunc('month', (ends_at - interval '1 microsecond') at time zone 'UTC')`,
    )
    .execute();

  await db.schema
    .createTable("claims")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("drop_id", "uuid", (c) => c.notNull().references("drops.id"))
    .addColumn("person_id", "uuid", (c) => c.notNull().references("people.id"))
    .addColumn("identity_id", "uuid", (c) => c.notNull().references("identities.id"))
    .addColumn("status", "text", (c) =>
      c
        .notNull()
        .defaultTo("pending")
        .check(sql`status in ('pending', 'active', 'exhausted', 'expired', 'revoked', 'failed')`),
    )
    .addColumn("cap_micro", "bigint", (c) => c.notNull().check(sql`cap_micro > 0`))
    .addColumn("terms_version", "text", (c) => c.notNull())
    .addColumn("attested_at", "timestamptz", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("ended_at", "timestamptz")
    .addColumn("end_reason", "text")
    .addColumn("ended_by", "text", (c) =>
      c.check(sql`ended_by in ('operator', 'claimer', 'system')`),
    )
    // One claim per person per drop, enforced by the database as well as the application.
    .addUniqueConstraint("claims_one_per_person_per_drop", ["drop_id", "person_id"])
    .execute();
  await db.schema.createIndex("claims_person_idx").on("claims").column("person_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("claims").execute();
  await db.schema.dropTable("drops").execute();
  await db.schema.dropTable("claimer_sessions").execute();
  await db.schema.dropTable("oauth_states").execute();
  await db.schema.dropTable("identities").execute();
  await db.schema.dropTable("people").execute();
}
