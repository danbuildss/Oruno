import type { Kysely } from "kysely";
import type { AuditActorType, Database } from "../db/schema.js";

export interface AuditEvent {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  /** Never put secrets here. */
  details?: Record<string, unknown>;
}

/** Appends one audit event. Pass a transaction to record it atomically with the change it describes. */
export async function recordAudit(db: Kysely<Database>, event: AuditEvent): Promise<void> {
  await db
    .insertInto("audit_events")
    .values({
      actor_type: event.actorType,
      actor_id: event.actorId ?? null,
      action: event.action,
      subject_type: event.subjectType ?? null,
      subject_id: event.subjectId ?? null,
      details: JSON.stringify(event.details ?? {}),
    })
    .execute();
}
