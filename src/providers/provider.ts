/**
 * The only boundary between Oruno and an inference provider (CLAUDE.md: no provider-specific
 * code elsewhere). Every write takes an idempotency key so retries are safe.
 */
export interface CreateKeyInput {
  idempotencyKey: string;
  /** Human-readable label at the provider, e.g. `oruno-claim-<id>`. */
  name: string;
  capMicro: bigint;
  expiresAt: Date;
  models: string[];
}

export interface ProviderKey {
  keyId: string;
  /** The usable credential. Returned once; Oruno never stores or logs it. */
  secret: string;
  /** Safe-to-show beginning of the key. */
  prefix: string;
}

export interface InferenceProvider {
  readonly name: "fake" | "surplus";
  /** Base URL a claimer sets as ANTHROPIC_BASE_URL in Claude Code. */
  readonly claudeCodeBaseUrl: string;
  createKey(input: CreateKeyInput): Promise<ProviderKey>;
  /** Issues a new secret under a new key id, retires the old key, and caps the new one. */
  rotateKey(params: {
    keyId: string;
    capMicro: bigint;
    idempotencyKey: string;
  }): Promise<ProviderKey>;
  /** Idempotent: revoking an already revoked or unknown key succeeds. */
  revokeKey(params: { keyId: string; idempotencyKey: string }): Promise<void>;
  /** Cumulative amount spent by this key, in micro-dollars. */
  getKeySpend(keyId: string): Promise<bigint>;
  /** Upper bound on total spend across all Oruno keys at the provider. */
  setSpendCeiling(params: { limitMicro: bigint; idempotencyKey: string }): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** True for timeouts, 5xx and rate limits: trying again may work. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
