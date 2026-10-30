import { describe, expect, it } from "vitest";
import {
  canTransitionClaim,
  canTransitionDrop,
  claimabilityProblem,
  createDropSchema,
  DEFAULT_ELIGIBILITY,
  windowProblem,
} from "../../src/drops/rules.js";

const validInput = {
  slug: "drop-1",
  name: "Drop #1",
  capMicro: "5000000",
  maxClaims: 20,
  models: ["claude-sonnet-5"],
  startsAt: "2026-11-02T00:00:00Z",
  endsAt: "2026-11-16T00:00:00Z",
  termsVersion: "2026-10-30",
};

describe("createDropSchema", () => {
  it("parses a valid drop, converting money to bigint and applying default eligibility", () => {
    const drop = createDropSchema.parse(validInput);
    expect(drop.capMicro).toBe(5_000_000n);
    expect(drop.startsAt).toEqual(new Date("2026-11-02T00:00:00Z"));
    expect(drop.eligibility).toEqual(DEFAULT_ELIGIBILITY);
  });

  it.each([
    ["decimal money", { capMicro: "5.5" }],
    ["number instead of string money", { capMicro: 5000000 }],
    ["zero cap", { capMicro: "0" }],
    ["negative cap", { capMicro: "-1" }],
    ["cap over $1,000", { capMicro: "1000000001" }],
    ["uppercase slug", { slug: "Drop-1" }],
    ["slug too short", { slug: "ab" }],
    ["zero claims", { maxClaims: 0 }],
    ["no models", { models: [] }],
    ["blank name", { name: "   " }],
    ["date without timezone", { startsAt: "2026-11-02T00:00:00" }],
    ["ends before it starts", { endsAt: "2026-11-01T00:00:00Z" }],
    ["crosses a month boundary", { endsAt: "2026-12-05T00:00:00Z" }],
  ])("rejects %s", (_label, change) => {
    expect(createDropSchema.safeParse({ ...validInput, ...change }).success).toBe(false);
  });
});

describe("windowProblem", () => {
  it("allows a window that ends exactly at midnight on the first of the next month", () => {
    expect(
      windowProblem(new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z")),
    ).toBeNull();
  });

  it("rejects a window that ends one millisecond into the next month", () => {
    expect(
      windowProblem(new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00.001Z")),
    ).toMatch(/same UTC calendar month/);
  });
});

describe("state machines", () => {
  it("allows only the defined drop transitions", () => {
    expect(canTransitionDrop("draft", "active")).toBe(true);
    expect(canTransitionDrop("active", "paused")).toBe(true);
    expect(canTransitionDrop("paused", "active")).toBe(true);
    expect(canTransitionDrop("active", "ended")).toBe(true);
    expect(canTransitionDrop("ended", "active")).toBe(false);
    expect(canTransitionDrop("draft", "paused")).toBe(false);
  });

  it("allows only the defined claim transitions", () => {
    expect(canTransitionClaim("pending", "active")).toBe(true);
    expect(canTransitionClaim("pending", "revoked")).toBe(true);
    expect(canTransitionClaim("active", "exhausted")).toBe(true);
    expect(canTransitionClaim("revoked", "active")).toBe(false);
    expect(canTransitionClaim("expired", "revoked")).toBe(false);
  });
});

describe("claimabilityProblem", () => {
  const drop = {
    status: "active" as const,
    starts_at: new Date("2026-11-02T00:00:00Z"),
    ends_at: new Date("2026-11-16T00:00:00Z"),
    claims_count: 0,
    max_claims: 2,
  };
  const during = new Date("2026-11-05T00:00:00Z");

  it("is claimable when active, in its window, with slots left", () => {
    expect(claimabilityProblem(drop, during)).toBeNull();
  });
  it("is not claimable when paused", () => {
    expect(claimabilityProblem({ ...drop, status: "paused" }, during)).toBe("drop_not_active");
  });
  it("is not claimable before it starts or after it ends", () => {
    expect(claimabilityProblem(drop, new Date("2026-11-01T23:59:59Z"))).toBe("drop_not_started");
    expect(claimabilityProblem(drop, new Date("2026-11-16T00:00:00Z"))).toBe("drop_ended");
  });
  it("is not claimable when full", () => {
    expect(claimabilityProblem({ ...drop, claims_count: 2 }, during)).toBe("drop_full");
  });
});
