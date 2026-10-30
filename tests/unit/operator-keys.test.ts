import { describe, expect, it } from "vitest";
import {
  generateOperatorKey,
  hashOperatorKey,
  looksLikeOperatorKey,
  OPERATOR_KEY_PREFIX,
} from "../../src/auth/operator-keys.js";

describe("operator keys", () => {
  it("generates keys with the expected format", () => {
    const { key, prefix, hash } = generateOperatorKey();
    expect(key.startsWith(OPERATOR_KEY_PREFIX)).toBe(true);
    expect(looksLikeOperatorKey(key)).toBe(true);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(key.length / 2);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the key as its own hash, and hashing is deterministic", () => {
    const { key, hash } = generateOperatorKey();
    expect(hash).not.toContain(key);
    expect(hashOperatorKey(key)).toBe(hash);
  });

  it("generates a different key every time", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateOperatorKey().key));
    expect(keys.size).toBe(1000);
  });

  it("rejects malformed keys", () => {
    for (const bad of [
      "",
      "oru_op_",
      "oru_op_short",
      `sk_${"a".repeat(43)}`,
      `oru_op_${"a".repeat(42)}!`,
    ]) {
      expect(looksLikeOperatorKey(bad)).toBe(false);
    }
  });
});
