import type { ColumnType, Generated } from "kysely";

/** Timestamps are written by the database and read back as Date. */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface OperatorsTable {
  id: Generated<string>;
  name: string;
  /** First characters of the key, safe to show in logs and UIs. */
  key_prefix: string;
  /** SHA-256 of the full key. The key itself is never stored. */
  key_hash: string;
  created_at: Generated<Timestamp>;
  disabled_at: Timestamp | null;
}

export type AuditActorType = "operator" | "system" | "claimer";

export interface AuditEventsTable {
  id: Generated<string>;
  occurred_at: Generated<Timestamp>;
  actor_type: AuditActorType;
  actor_id: string | null;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  details: ColumnType<Record<string, unknown>, string | undefined, never>;
}

export interface Database {
  operators: OperatorsTable;
  audit_events: AuditEventsTable;
}
