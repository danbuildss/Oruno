import { z } from "zod";
import type { ClaimStatus, DropStatus } from "../db/schema.js";

/** 1 USD in micro-dollars. */
export const MICRO_PER_USD = 1_000_000n;
/** Upper bound on a single claim's cap ($1,000), as a guard against typos. */
export const MAX_CAP_MICRO = 1_000n * MICRO_PER_USD;

/** Defaults approved in D-013 / D-014. */
export const DEFAULT_ELIGIBILITY = {
  minAccountAgeDays: 180,
  minPublicRepos: 3,
  minContributions: 20,
} as const;

const microAmount = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/, "must be a positive whole number of micro-dollars, as a string")
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_CAP_MICRO, "must not exceed $1,000 per claim");

export const createDropSchema = z
  .object({
    slug: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/,
        "3–48 characters: lowercase letters, digits and hyphens",
      ),
    name: z.string().trim().min(1).max(120),
    capMicro: microAmount,
    maxClaims: z.number().int().min(1).max(10_000),
    models: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
    startsAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    endsAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    termsVersion: z.string().trim().min(1).max(40),
    eligibility: z
      .object({
        minAccountAgeDays: z.number().int().min(0).max(3650),
        minPublicRepos: z.number().int().min(0).max(1000),
        minContributions: z.number().int().min(0).max(100_000),
      })
      .default(DEFAULT_ELIGIBILITY),
  })
  .superRefine((drop, ctx) => {
    // Zod still runs this when a field failed; only compare real dates.
    if (!(drop.startsAt instanceof Date) || !(drop.endsAt instanceof Date)) return;
    const problem = windowProblem(drop.startsAt, drop.endsAt);
    if (problem) ctx.addIssue({ code: "custom", path: ["endsAt"], message: problem });
  });

export type CreateDropInput = z.infer<typeof createDropSchema>;

/**
 * A drop window must end after it starts, and start and end within one UTC calendar month,
 * because the provider's budgets reset monthly (threat TH-4). Returns a message, or null if valid.
 */
export function windowProblem(startsAt: Date, endsAt: Date): string | null {
  if (!(endsAt.getTime() > startsAt.getTime())) return "must be after startsAt";
  const lastInstant = new Date(endsAt.getTime() - 1);
  const sameMonth =
    startsAt.getUTCFullYear() === lastInstant.getUTCFullYear() &&
    startsAt.getUTCMonth() === lastInstant.getUTCMonth();
  return sameMonth ? null : "the drop must start and end within the same UTC calendar month";
}

const DROP_TRANSITIONS: Record<DropStatus, readonly DropStatus[]> = {
  draft: ["active", "ended"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: [],
};

export function canTransitionDrop(from: DropStatus, to: DropStatus): boolean {
  return DROP_TRANSITIONS[from].includes(to);
}

const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  pending: ["active", "failed", "revoked", "expired"],
  active: ["exhausted", "revoked", "expired"],
  exhausted: [],
  expired: [],
  revoked: [],
  failed: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from].includes(to);
}

/** Claims that still hold access (or are about to). */
export const OPEN_CLAIM_STATUSES: readonly ClaimStatus[] = ["pending", "active"];

export type ClaimabilityProblem =
  | "drop_not_active"
  | "drop_not_started"
  | "drop_ended"
  | "drop_full";

export function claimabilityProblem(
  drop: {
    status: DropStatus;
    starts_at: Date;
    ends_at: Date;
    claims_count: number;
    max_claims: number;
  },
  now: Date,
): ClaimabilityProblem | null {
  if (drop.status !== "active") return "drop_not_active";
  if (now.getTime() < drop.starts_at.getTime()) return "drop_not_started";
  if (now.getTime() >= drop.ends_at.getTime()) return "drop_ended";
  if (drop.claims_count >= drop.max_claims) return "drop_full";
  return null;
}
