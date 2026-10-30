import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("operators")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (c) => c.notNull().check(sql`length(trim(name)) > 0`))
    .addColumn("key_prefix", "text", (c) => c.notNull().unique())
    .addColumn("key_hash", "text", (c) =>
      c.notNull().unique().check(sql`key_hash ~ '^[0-9a-f]{64}$'`),
    )
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("disabled_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("audit_events")
    .addColumn("id", "bigint", (c) => c.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("occurred_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("actor_type", "text", (c) =>
      c.notNull().check(sql`actor_type in ('operator', 'system', 'claimer')`),
    )
    .addColumn("actor_id", "text")
    .addColumn("action", "text", (c) => c.notNull().check(sql`length(action) > 0`))
    .addColumn("subject_type", "text")
    .addColumn("subject_id", "text")
    .addColumn("details", "jsonb", (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();

  await db.schema
    .createIndex("audit_events_occurred_at_idx")
    .on("audit_events")
    .column("occurred_at")
    .execute();

  // The audit log is append-only: updates and deletes are refused by the database itself.
  await sql`
    create function audit_events_append_only() returns trigger language plpgsql as $$
    begin
      raise exception 'audit_events is append-only';
    end;
    $$
  `.execute(db);
  await sql`
    create trigger audit_events_no_update_or_delete
    before update or delete on audit_events
    for each row execute function audit_events_append_only()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("audit_events").execute();
  await sql`drop function if exists audit_events_append_only()`.execute(db);
  await db.schema.dropTable("operators").execute();
}
