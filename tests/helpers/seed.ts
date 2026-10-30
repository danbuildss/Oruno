import { randomBytes, randomUUID } from "node:crypto";
import { createOperator } from "../../src/auth/operator-keys.js";
import { randomToken, sha256Hex } from "../../src/auth/tokens.js";
import type { Db } from "../../src/db/client.js";
import { createDrop, transitionDrop } from "../../src/drops/drops.js";
import { createDropSchema } from "../../src/drops/rules.js";
import { recordFunding } from "../../src/ledger/ledger.js";

export const NOW = new Date("2026-11-05T12:00:00Z");

export async function seedOperator(db: Db): Promise<{ id: string; key: string }> {
  const { operator, key } = await createOperator(db, `operator-${randomUUID().slice(0, 8)}`);
  return { id: operator.id, key };
}

export const dropInput = (overrides: Record<string, unknown> = {}) => ({
  slug: `drop-${randomUUID().slice(0, 8)}`,
  name: "Drop #1",
  capMicro: "5000000",
  maxClaims: 20,
  models: ["claude-sonnet-5"],
  startsAt: "2026-11-02T00:00:00Z",
  endsAt: "2026-11-16T00:00:00Z",
  termsVersion: "2026-10-30",
  ...overrides,
});

/** A unique, valid-looking Base transaction hash. */
export function txHash(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

/**
 * Creates a drop, funds it (by default: enough for every slot) and activates it.
 * `fundMicro: 0n` skips funding.
 */
export async function seedDrop(
  db: Db,
  operatorId: string,
  overrides: Record<string, unknown> = {},
  options: { activate?: boolean; fundMicro?: bigint } = {},
) {
  const drop = await createDrop(db, createDropSchema.parse(dropInput(overrides)), operatorId);
  const fund = options.fundMicro ?? drop.cap_micro * BigInt(drop.max_claims);
  if (fund > 0n) {
    await recordFunding(db, {
      dropId: drop.id,
      amountMicro: fund,
      reference: txHash(),
      note: null,
      operatorId,
      now: NOW,
    });
  }
  if (options.activate === false) return drop;
  return transitionDrop(db, {
    dropId: drop.id,
    to: "active",
    actor: { type: "operator", id: operatorId },
    now: NOW,
  });
}

/** A signed-in claimer with a GitHub identity, created directly in the database. */
export async function seedClaimer(
  db: Db,
  signals: { ageDays?: number; publicRepos?: number; contributions?: number | null } = {},
): Promise<{ personId: string; identityId: string; token: string }> {
  const person = await db
    .insertInto("people")
    .values({ blocked_at: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  const identity = await db
    .insertInto("identities")
    .values({
      person_id: person.id,
      provider: "github",
      provider_user_id: randomUUID(),
      login: `dev-${randomUUID().slice(0, 6)}`,
      account_created_at: new Date(NOW.getTime() - (signals.ageDays ?? 400) * 86_400_000),
      public_repos: signals.publicRepos ?? 5,
      followers: 1,
      contributions_last_year: signals.contributions === undefined ? 50 : signals.contributions,
      signals_checked_at: NOW,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const token = `oru_cs_${randomToken()}`;
  await db
    .insertInto("claimer_sessions")
    .values({
      person_id: person.id,
      identity_id: identity.id,
      token_hash: sha256Hex(token),
      expires_at: new Date(NOW.getTime() + 86_400_000),
      revoked_at: null,
    })
    .execute();
  return { personId: person.id, identityId: identity.id, token };
}

export const claimBody = (termsVersion = "2026-10-30") => ({
  termsVersion,
  acceptTerms: true,
  confirmAdult: true,
  confirmNotSanctioned: true,
});
