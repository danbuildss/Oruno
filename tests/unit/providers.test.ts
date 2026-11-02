import { describe, expect, it } from "vitest";
import { FakeProvider } from "../../src/providers/fake.js";
import { ProviderError } from "../../src/providers/provider.js";
import { SurplusProvider } from "../../src/providers/surplus.js";

const later = new Date(Date.now() + 86_400_000);

describe("FakeProvider", () => {
  it("issues a capped, expiring, model-scoped key, idempotently", async () => {
    const p = new FakeProvider();
    const input = {
      idempotencyKey: "k1",
      name: "n",
      capMicro: 5_000_000n,
      expiresAt: later,
      models: ["m1"],
    };
    const a = await p.createKey(input);
    const b = await p.createKey(input);
    expect(b).toEqual(a);
    expect(p.keys.size).toBe(1);
    expect(p.accepts(a.secret, "m1", new Date())).toBe(true);
    expect(p.accepts(a.secret, "other-model", new Date())).toBe(false);
    expect(p.accepts(a.secret, "m1", later)).toBe(false);
  });

  it("stops spend at the cap unless asked to overshoot", async () => {
    const p = new FakeProvider();
    const k = await p.createKey({
      idempotencyKey: "k",
      name: "n",
      capMicro: 100n,
      expiresAt: later,
      models: ["m"],
    });
    expect(p.spend(k.keyId, 70n)).toBe(70n);
    expect(p.spend(k.keyId, 70n)).toBe(30n);
    expect(p.spend(k.keyId, 10n)).toBe(0n);
    expect(await p.getKeySpend(k.keyId)).toBe(100n);
    expect(p.accepts(k.secret, "m", new Date())).toBe(false);
    expect(p.spend(k.keyId, 15n, { overshoot: true })).toBe(15n);
    expect(await p.getKeySpend(k.keyId)).toBe(115n);
  });

  it("rotation retires the old key and caps the new one", async () => {
    const p = new FakeProvider();
    const old = await p.createKey({
      idempotencyKey: "k",
      name: "n",
      capMicro: 100n,
      expiresAt: later,
      models: ["m"],
    });
    const fresh = await p.rotateKey({ keyId: old.keyId, capMicro: 40n, idempotencyKey: "r1" });
    expect(fresh.keyId).not.toBe(old.keyId);
    expect(p.accepts(old.secret, "m", new Date())).toBe(false);
    expect(p.spend(fresh.keyId, 100n)).toBe(40n);
  });

  it("injects retryable and permanent failures", async () => {
    const p = new FakeProvider();
    p.failNext("createKey", { retryable: true, times: 2 });
    const input = { idempotencyKey: "k", name: "n", capMicro: 1n, expiresAt: later, models: ["m"] };
    await expect(p.createKey(input)).rejects.toMatchObject({ retryable: true });
    await expect(p.createKey(input)).rejects.toBeInstanceOf(ProviderError);
    await expect(p.createKey(input)).resolves.toBeTruthy();
    p.failNext("revokeKey", { retryable: false });
    await expect(p.revokeKey({ keyId: "x", idempotencyKey: "r" })).rejects.toMatchObject({
      retryable: false,
    });
  });
});

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function surplusWith(responses: Array<{ match: string; status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses.find((x) => `${method} ${url}`.includes(x.match));
    if (!r) throw new Error(`unexpected ${method} ${url}`);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  const provider = new SurplusProvider({
    adminKey: "inf_admin_SECRETADMIN",
    workspaceId: "ws_1",
    baseUrl: "https://surplus.test",
    fetch: fetchImpl,
  });
  return { provider, calls };
}

describe("SurplusProvider (UNVERIFIED against the real API; request shapes from the docs)", () => {
  it("mints a buyer key with scope, a hard-stop monthly budget, expiry and an idempotency key", async () => {
    const { provider, calls } = surplusWith([
      {
        match: "POST https://surplus.test/v1/keys",
        body: { id: "key_1", key: "inf_abc123", key_prefix: "inf_abc1", key_type: "buyer" },
      },
    ]);
    const key = await provider.createKey({
      idempotencyKey: "oruno:claim:c1:create",
      name: "oruno-claim-c1",
      capMicro: 5_000_000n,
      expiresAt: new Date(Date.now() + 3_600_000),
      models: ["claude-sonnet-5"],
    });
    expect(key).toEqual({ keyId: "key_1", secret: "inf_abc123", prefix: "inf_abc1" });
    const call = calls[0];
    expect(call?.headers.authorization).toBe("Bearer inf_admin_SECRETADMIN");
    expect(call?.headers["idempotency-key"]).toBe("oruno:claim:c1:create");
    expect(call?.body).toMatchObject({
      name: "oruno-claim-c1",
      key_type: "buyer",
      scope: { models: ["claude-sonnet-5"], trusted_only: true },
      budget: { limit_month_micro: 5_000_000, hard_stop: true },
    });
    const body = (call?.body ?? {}) as { expires_in_seconds?: number };
    expect(body.expires_in_seconds).toBeGreaterThan(3500);
    expect(provider.claudeCodeBaseUrl).toBe("https://surplus.test/anthropic");
  });

  it("rotates, then sets the successor's budget to what's left", async () => {
    const { provider, calls } = surplusWith([
      {
        match: "POST https://surplus.test/v1/keys/key_1/rotate",
        body: { id: "key_2", key: "inf_new", key_prefix: "inf_new" },
      },
      { match: "PATCH https://surplus.test/v1/keys/key_2", body: { id: "key_2" } },
    ]);
    await provider.rotateKey({ keyId: "key_1", capMicro: 3_000_000n, idempotencyKey: "rot1" });
    expect(calls[0]?.body).toEqual({ grace_hours: 0 });
    expect(calls[1]?.body).toEqual({ budget: { limit_month_micro: 3_000_000, hard_stop: true } });
  });

  it("treats revoking a missing key as done", async () => {
    const { provider } = surplusWith([
      {
        match: "DELETE https://surplus.test/v1/keys/gone",
        status: 404,
        body: { error: { code: "not_found" } },
      },
    ]);
    await expect(
      provider.revokeKey({ keyId: "gone", idempotencyKey: "r" }),
    ).resolves.toBeUndefined();
  });

  it("classifies errors as retryable or not, and never includes the admin key in messages", async () => {
    for (const [status, retryable] of [
      [500, true],
      [429, true],
      [400, false],
      [403, false],
    ] as const) {
      const { provider } = surplusWith([
        {
          match: "POST https://surplus.test/v1/keys",
          status,
          body: { error: { code: `e${status}` } },
        },
      ]);
      const err = await provider
        .createKey({
          idempotencyKey: "i",
          name: "n",
          capMicro: 1n,
          expiresAt: later,
          models: ["m"],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).retryable).toBe(retryable);
      expect((err as Error).message).not.toContain("SECRETADMIN");
    }
  });

  it("treats HTTP 200 with an error body as a failure", async () => {
    const { provider } = surplusWith([
      { match: "POST https://surplus.test/v1/keys", body: { error: { code: "budget_exceeded" } } },
    ]);
    await expect(
      provider.createKey({
        idempotencyKey: "i",
        name: "n",
        capMicro: 1n,
        expiresAt: later,
        models: ["m"],
      }),
    ).rejects.toThrow(/budget_exceeded/);
  });

  it("reads a key's spend from the budget spend list (shape OPEN until Phase 4b)", async () => {
    const { provider } = surplusWith([
      {
        match: "GET https://surplus.test/v1/budgets/spend",
        body: {
          data: [
            { scope_type: "workspace", scope_id: "ws_1", spent_micro: 9 },
            { scope_type: "key", scope_id: "key_1", spent_micro: 1234 },
          ],
        },
      },
    ]);
    expect(await provider.getKeySpend("key_1")).toBe(1234n);
    expect(await provider.getKeySpend("unknown")).toBe(0n);
  });

  it("sets the workspace ceiling as a hard-stop budget", async () => {
    const { provider, calls } = surplusWith([
      { match: "PUT https://surplus.test/v1/budgets", body: {} },
    ]);
    await provider.setSpendCeiling({ limitMicro: 100_000_000n, idempotencyKey: "c" });
    expect(calls[0]?.body).toEqual({
      scope_type: "workspace",
      scope_id: "ws_1",
      limit_month_micro: 100_000_000,
      hard_stop: true,
    });
  });
});
