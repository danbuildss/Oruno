import { randomBytes, randomUUID } from "node:crypto";
import type { CreateKeyInput, InferenceProvider, ProviderKey } from "./provider.js";
import { ProviderError } from "./provider.js";

interface FakeKey {
  keyId: string;
  secret: string;
  prefix: string;
  name: string;
  capMicro: bigint;
  spentMicro: bigint;
  expiresAt: Date;
  models: string[];
  revoked: boolean;
}

type Operation = "createKey" | "rotateKey" | "revokeKey" | "getKeySpend" | "setSpendCeiling";

/**
 * In-memory stand-in for Surplus Pattern A, for development and tests. Behaves like the documented
 * provider: hard per-key caps, expiry, model scope, idempotent writes, revocation, cumulative spend.
 * It can also inject failures, and (deliberately) overshoot a cap to test Oruno's handling.
 * Refused in production by configuration.
 */
export class FakeProvider implements InferenceProvider {
  readonly name = "fake" as const;
  readonly claudeCodeBaseUrl = "https://fake-provider.invalid/anthropic";
  readonly keys = new Map<string, FakeKey>();
  private readonly idempotent = new Map<string, unknown>();
  private readonly failures: Array<{ op: Operation; retryable: boolean; remaining: number }> = [];
  ceilingMicro: bigint | null = null;
  calls: Record<Operation, number> = {
    createKey: 0,
    rotateKey: 0,
    revokeKey: 0,
    getKeySpend: 0,
    setSpendCeiling: 0,
  };

  /** Makes the next `times` calls of `op` fail. */
  failNext(op: Operation, options: { retryable?: boolean; times?: number } = {}): void {
    this.failures.push({ op, retryable: options.retryable ?? true, remaining: options.times ?? 1 });
  }

  private maybeFail(op: Operation): void {
    this.calls[op] += 1;
    const failure = this.failures.find((f) => f.op === op && f.remaining > 0);
    if (!failure) return;
    failure.remaining -= 1;
    throw new ProviderError(`fake ${op} failure`, failure.retryable);
  }

  private once<T>(idempotencyKey: string, run: () => T): T {
    if (this.idempotent.has(idempotencyKey)) return this.idempotent.get(idempotencyKey) as T;
    const result = run();
    this.idempotent.set(idempotencyKey, result);
    return result;
  }

  private newKey(
    input: Omit<FakeKey, "keyId" | "secret" | "prefix" | "spentMicro" | "revoked">,
  ): FakeKey {
    const secret = `inf_${randomBytes(16).toString("hex")}`;
    const key: FakeKey = {
      ...input,
      keyId: randomUUID(),
      secret,
      prefix: secret.slice(0, 12),
      spentMicro: 0n,
      revoked: false,
    };
    this.keys.set(key.keyId, key);
    return key;
  }

  async createKey(input: CreateKeyInput): Promise<ProviderKey> {
    this.maybeFail("createKey");
    return this.once(`create:${input.idempotencyKey}`, () => {
      const key = this.newKey({
        name: input.name,
        capMicro: input.capMicro,
        expiresAt: input.expiresAt,
        models: [...input.models],
      });
      return { keyId: key.keyId, secret: key.secret, prefix: key.prefix };
    });
  }

  async rotateKey(params: {
    keyId: string;
    capMicro: bigint;
    idempotencyKey: string;
  }): Promise<ProviderKey> {
    this.maybeFail("rotateKey");
    return this.once(`rotate:${params.idempotencyKey}`, () => {
      const old = this.keys.get(params.keyId);
      if (!old || old.revoked) throw new ProviderError("key not found", false);
      old.revoked = true;
      const key = this.newKey({
        name: old.name,
        capMicro: params.capMicro,
        expiresAt: old.expiresAt,
        models: old.models,
      });
      return { keyId: key.keyId, secret: key.secret, prefix: key.prefix };
    });
  }

  async revokeKey(params: { keyId: string; idempotencyKey: string }): Promise<void> {
    this.maybeFail("revokeKey");
    const key = this.keys.get(params.keyId);
    if (key) key.revoked = true;
  }

  async getKeySpend(keyId: string): Promise<bigint> {
    this.maybeFail("getKeySpend");
    const key = this.keys.get(keyId);
    if (!key) throw new ProviderError("key not found", false);
    return key.spentMicro;
  }

  async setSpendCeiling(params: { limitMicro: bigint; idempotencyKey: string }): Promise<void> {
    this.maybeFail("setSpendCeiling");
    this.ceilingMicro = params.limitMicro;
  }

  // --- Test helpers that simulate a claimer using their key ---

  /** Whether a secret would be accepted for `model` at `now`. */
  accepts(secret: string, model: string, now: Date): boolean {
    const key = [...this.keys.values()].find((k) => k.secret === secret);
    return Boolean(
      key &&
        !key.revoked &&
        now < key.expiresAt &&
        key.models.includes(model) &&
        key.spentMicro < key.capMicro,
    );
  }

  /**
   * Simulates usage. Like a hard-stop budget, spend stops at the cap unless `overshoot` is set
   * (to model a provider that lets a final request run past the cap).
   */
  spend(keyId: string, amountMicro: bigint, options: { overshoot?: boolean } = {}): bigint {
    const key = this.keys.get(keyId);
    if (!key || key.revoked) return 0n;
    const room = key.capMicro - key.spentMicro;
    const charged = options.overshoot ? amountMicro : amountMicro < room ? amountMicro : room;
    if (charged <= 0n) return 0n;
    key.spentMicro += charged;
    return charged;
  }
}
