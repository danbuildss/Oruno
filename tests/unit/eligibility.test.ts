import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "../../src/eligibility/eligibility.js";

const thresholds = { minAccountAgeDays: 180, minPublicRepos: 3, minContributions: 20 };
const now = new Date("2026-11-15T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("evaluateEligibility (D-013/D-014)", () => {
  it("accepts an old account with enough repos", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(400), publicRepos: 3, contributionsLastYear: 0 },
      thresholds,
      now,
    );
    expect(r).toEqual({ eligible: true, reasons: [], accountAgeDays: 400 });
  });

  it("accepts an old account with enough contributions but few repos", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(200), publicRepos: 0, contributionsLastYear: 20 },
      thresholds,
      now,
    );
    expect(r.eligible).toBe(true);
  });

  it("accepts exactly 180 days old (boundary)", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(180), publicRepos: 5, contributionsLastYear: null },
      thresholds,
      now,
    );
    expect(r.eligible).toBe(true);
  });

  it("rejects 179 days old", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(179), publicRepos: 50, contributionsLastYear: 500 },
      thresholds,
      now,
    );
    expect(r).toMatchObject({ eligible: false, reasons: ["account_too_new"] });
  });

  it("rejects 2 repos and 19 contributions", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(1000), publicRepos: 2, contributionsLastYear: 19 },
      thresholds,
      now,
    );
    expect(r).toMatchObject({ eligible: false, reasons: ["not_enough_activity"] });
  });

  it("treats unknown contributions as zero", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(1000), publicRepos: 0, contributionsLastYear: null },
      thresholds,
      now,
    );
    expect(r.reasons).toEqual(["not_enough_activity"]);
  });

  it("reports every failing reason", () => {
    const r = evaluateEligibility(
      { accountCreatedAt: daysAgo(10), publicRepos: 0, contributionsLastYear: 0 },
      thresholds,
      now,
    );
    expect(r.reasons).toEqual(["account_too_new", "not_enough_activity"]);
  });
});
