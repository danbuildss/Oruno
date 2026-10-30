import { createHash, randomBytes } from "node:crypto";
import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";

/**
 * Operator API keys: `oru_op_` followed by 43 base64url characters (32 random bytes).
 * Only a SHA-256 hash and a short prefix are stored. A fast hash is appropriate here
 * because the key is high-entropy random data, not a human-chosen password.
 */
export const OPERATOR_KEY_PREFIX = "oru_op_";
const KEY_PATTERN = /^oru_op_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = OPERATOR_KEY_PREFIX.length + 8;

export function generateOperatorKey(): { key: string; prefix: string; hash: string } {
  const key = OPERATOR_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashOperatorKey(key) };
}

export function hashOperatorKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeOperatorKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

export interface Operator {
  id: string;
  name: string;
  keyPrefix: string;
}

/** Creates an operator and returns its key. The key is shown once and never stored. */
export async function createOperator(
  db: Db,
  name: string,
  actor: { type: "operator" | "system"; id?: string } = { type: "system" },
): Promise<{ operator: Operator; key: string }> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Operator name is required.");
  const { key, prefix, hash } = generateOperatorKey();

  const operator = await db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto("operators")
      .values({ name: trimmed, key_prefix: prefix, key_hash: hash, disabled_at: null })
      .returning(["id", "name", "key_prefix"])
      .executeTakeFirstOrThrow();
    await recordAudit(trx, {
      actorType: actor.type,
      actorId: actor.id ?? null,
      action: "operator.created",
      subjectType: "operator",
      subjectId: row.id,
      details: { name: row.name, keyPrefix: row.key_prefix },
    });
    return { id: row.id, name: row.name, keyPrefix: row.key_prefix };
  });

  return { operator, key };
}

export async function disableOperator(
  db: Db,
  operatorId: string,
  actor: { type: "operator" | "system"; id?: string },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("operators")
      .set({ disabled_at: new Date() })
      .where("id", "=", operatorId)
      .where("disabled_at", "is", null)
      .executeTakeFirst();
    if (updated.numUpdatedRows === 0n) return;
    await recordAudit(trx, {
      actorType: actor.type,
      actorId: actor.id ?? null,
      action: "operator.disabled",
      subjectType: "operator",
      subjectId: operatorId,
    });
  });
}

/** Returns the active operator for a presented key, or null. */
export async function findOperatorByKey(db: Db, presentedKey: string): Promise<Operator | null> {
  if (!looksLikeOperatorKey(presentedKey)) return null;
  const row = await db
    .selectFrom("operators")
    .select(["id", "name", "key_prefix"])
    .where("key_hash", "=", hashOperatorKey(presentedKey))
    .where("disabled_at", "is", null)
    .executeTakeFirst();
  return row ? { id: row.id, name: row.name, keyPrefix: row.key_prefix } : null;
}
