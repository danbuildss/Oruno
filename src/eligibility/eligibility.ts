/** Public GitHub account signals captured at sign-in. */
export interface IdentitySignals {
  accountCreatedAt: Date;
  publicRepos: number;
  /** Contributions in the last 12 months; null if it couldn't be read (treated as 0). */
  contributionsLastYear: number | null;
}

export interface EligibilityThresholds {
  minAccountAgeDays: number;
  minPublicRepos: number;
  minContributions: number;
}

export type IneligibleReason = "account_too_new" | "not_enough_activity";

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibleReason[];
  accountAgeDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * D-013/D-014: the account must be at least `minAccountAgeDays` old, AND have at least
 * `minPublicRepos` public repositories OR `minContributions` contributions in the last year.
 */
export function evaluateEligibility(
  signals: IdentitySignals,
  thresholds: EligibilityThresholds,
  now: Date,
): EligibilityResult {
  const accountAgeDays = Math.floor(
    (now.getTime() - signals.accountCreatedAt.getTime()) / MS_PER_DAY,
  );
  const reasons: IneligibleReason[] = [];
  if (accountAgeDays < thresholds.minAccountAgeDays) reasons.push("account_too_new");

  const enoughRepos = signals.publicRepos >= thresholds.minPublicRepos;
  const enoughContributions = (signals.contributionsLastYear ?? 0) >= thresholds.minContributions;
  if (!enoughRepos && !enoughContributions) reasons.push("not_enough_activity");

  return { eligible: reasons.length === 0, reasons, accountAgeDays };
}
