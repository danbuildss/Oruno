import type { CreateKeyInput, InferenceProvider, ProviderKey } from "./provider.js";
import { ProviderError } from "./provider.js";

/**
 * Surplus Intelligence, Pattern A (one provisioned buyer key per claim, minted with an admin key).
 *
 * STATUS: UNVERIFIED. Written from Surplus's published documentation (llms.txt and the
 * whitelabel guide, read 2026-10-30) and tested only against simulated HTTP. Before real use,
 * Phase 4b must confirm every request and response shape with AT-1 to AT-15. In particular the
 * response of `GET /v1/budgets/spend` is not documented in detail.
 */
export interface SurplusOptions {
  adminKey: string;
  workspaceId: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.surplusintelligence.ai";

export class SurplusProvider implements InferenceProvider {
  readonly name = "surplus" as const;
  readonly claudeCodeBaseUrl: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: SurplusOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.claudeCodeBaseUrl = `${this.baseUrl}/anthropic`;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request(
    method: string,
    path: string,
    params: { body?: unknown; idempotencyKey?: string; okStatuses?: number[] } = {},
  ): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.options.adminKey}`,
          accept: "application/json",
          ...(params.body === undefined ? {} : { "content-type": "application/json" }),
          ...(params.idempotencyKey ? { "idempotency-key": params.idempotencyKey } : {}),
        },
        ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderError(`Surplus ${method} ${path}: network error (${String(error)})`, true);
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const ok = res.ok || (params.okStatuses ?? []).includes(res.status);
    // Surplus can return HTTP 200 with an error body on long requests; treat `error` as failure.
    const errorCode = (body as { error?: { code?: unknown } } | null)?.error?.code;
    if (!ok || (res.ok && errorCode !== undefined)) {
      const retryable = res.status >= 500 || res.status === 429;
      const code = typeof errorCode === "string" ? errorCode : `HTTP ${res.status}`;
      throw new ProviderError(`Surplus ${method} ${path}: ${code}`, retryable);
    }
    return { status: res.status, body };
  }

  private toKey(body: unknown): ProviderKey {
    const b = body as { id?: unknown; key?: unknown; key_prefix?: unknown };
    if (typeof b?.id !== "string" || typeof b.key !== "string") {
      throw new ProviderError("Surplus returned an unexpected key response", false);
    }
    return {
      keyId: b.id,
      secret: b.key,
      prefix: typeof b.key_prefix === "string" ? b.key_prefix : b.key.slice(0, 12),
    };
  }

  private budget(capMicro: bigint) {
    // Drops stay inside one UTC month (TH-4), so a monthly window holds the whole cap.
    return { limit_month_micro: Number(capMicro), hard_stop: true };
  }

  async createKey(input: CreateKeyInput): Promise<ProviderKey> {
    const expiresInSeconds = Math.max(
      60,
      Math.floor((input.expiresAt.getTime() - Date.now()) / 1000),
    );
    const { body } = await this.request("POST", "/v1/keys", {
      idempotencyKey: input.idempotencyKey,
      body: {
        name: input.name,
        key_type: "buyer",
        scope: { models: input.models, trusted_only: true },
        budget: this.budget(input.capMicro),
        expires_in_seconds: expiresInSeconds,
      },
    });
    return this.toKey(body);
  }

  async rotateKey(params: {
    keyId: string;
    capMicro: bigint;
    idempotencyKey: string;
  }): Promise<ProviderKey> {
    const { body } = await this.request(
      "POST",
      `/v1/keys/${encodeURIComponent(params.keyId)}/rotate`,
      {
        idempotencyKey: params.idempotencyKey,
        body: { grace_hours: 0 },
      },
    );
    const key = this.toKey(body);
    // The successor inherits the old budget; set it to what's left so rotation can't reset the cap.
    await this.request("PATCH", `/v1/keys/${encodeURIComponent(key.keyId)}`, {
      idempotencyKey: `${params.idempotencyKey}:cap`,
      body: { budget: this.budget(params.capMicro) },
    });
    return key;
  }

  async revokeKey(params: { keyId: string; idempotencyKey: string }): Promise<void> {
    await this.request("DELETE", `/v1/keys/${encodeURIComponent(params.keyId)}`, {
      idempotencyKey: params.idempotencyKey,
      okStatuses: [404],
    });
  }

  async getKeySpend(keyId: string): Promise<bigint> {
    const { body } = await this.request("GET", "/v1/budgets/spend");
    const entries = Array.isArray(body)
      ? body
      : ((body as { data?: unknown; budgets?: unknown } | null)?.data ??
        (body as { budgets?: unknown } | null)?.budgets);
    if (!Array.isArray(entries))
      throw new ProviderError("Surplus budget spend: unexpected shape", false);
    const entry = entries.find(
      (e: { scope_type?: unknown; scope_id?: unknown }) =>
        e?.scope_type === "key" && e?.scope_id === keyId,
    ) as { spent_micro?: unknown } | undefined;
    if (!entry) return 0n;
    const spent = entry.spent_micro;
    if (typeof spent === "number" && Number.isInteger(spent) && spent >= 0) return BigInt(spent);
    if (typeof spent === "string" && /^[0-9]+$/.test(spent)) return BigInt(spent);
    throw new ProviderError("Surplus budget spend: unexpected spent_micro", false);
  }

  async setSpendCeiling(params: { limitMicro: bigint; idempotencyKey: string }): Promise<void> {
    await this.request("PUT", "/v1/budgets", {
      idempotencyKey: params.idempotencyKey,
      body: {
        scope_type: "workspace",
        scope_id: this.options.workspaceId,
        limit_month_micro: Number(params.limitMicro),
        hard_stop: true,
      },
    });
  }
}
