# Providers

Where the AI comes from, what each provider gives us, and what we still need to confirm. Findings as of 2026-10-30.

**Status:** research findings from docs and live data. Nothing here is VERIFIED by our own tests until the provider spike (T-006) runs.

## Surplus Intelligence (first provider)

An inference marketplace settling in USDC on Base. One OpenAI-compatible base URL; a router picks the cheapest healthy seller. Docs: `https://www.surplusintelligence.ai/llms.txt`.

### What it gives us (Pattern A, "a Surplus key per customer")

| Need | Surplus feature |
| --- | --- |
| Key per claimer | Admin key (`inf_admin_…`) mints buyer keys via `POST /v1/keys` (Idempotency-Key required) |
| Hard cap | Key `budget` with `hard_stop` (on by default). Windows: `limit_day_micro`, `limit_month_micro` |
| Never exceed funding | Nested budgets: key ⊂ member ⊂ workspace ⊂ org; every scope must have room |
| Expiry | `expires_in_seconds` on the key |
| Model limits | `scope.models`, `providers`, `providers_blocked`, `trusted_only`, `min_discount_pct` |
| Revoke, rotate | `DELETE /v1/keys/{id}`; `POST /v1/keys/{id}/rotate` with optional `grace_hours` |
| Usage per key | `GET /v1/requests?key_id=…`, `/v1/buyer/usage/export`, analytics, `usage.recorded` webhook |
| Cost per request | `usage.buyer_cost_micro` (non-stream) or final stream usage event with `include_usage` |
| Privacy | Prompt and response bodies not stored by default |
| Claude Code | `ANTHROPIC_BASE_URL=https://api.surplusintelligence.ai/anthropic`, `ANTHROPIC_AUTH_TOKEN=inf_…`, `ANTHROPIC_API_KEY=""` |
| Funding | Card credit (not withdrawable) or deposited USDC on Base (withdrawable) |
| Limits | 200 active keys per workspace; ~1,200 requests/min per key and per IP |

### Catches

1. **No lifetime budget found.** Only day and month windows. A monthly $5 cap allows $10 if a drop crosses a month boundary. Run drops within one calendar month, or adjust caps at rollover. Ask Surplus.
2. **Per-request flat fee.** `/x402/info` shows `flat_fee_micro: 3000` ($0.003). Claude Code makes many requests. Confirm whether it applies to API-key traffic.
3. **Unclear "out of credit" in Claude Code.** On the Anthropic endpoint, a payment failure is a generic `400 invalid_request_error` with no code. Onboarding must explain it.
4. **Supply is not verified for quality.** Surplus verifies reachability and health, not model weights, quantization or injected system prompts. Use `trusted_only` and a provider allowlist.
5. **Long non-streamed requests return HTTP 200 even on failure.** Branch on the body, not the status.

### Terms (updated 2026-10-14)

- **§8 reselling is allowed if:** (a) our users agree to terms at least as strict as Surplus's Terms, AUP and Provider Terms; (b) we are solely responsible for our users' use, content and payment; (c) we don't present our product as provided by or affiliated with any model provider; (d) we don't disable or misrepresent caps or routing.
- **§8 prohibits** using the Service "to develop a directly competing routing service". Relevant to any future gateway.
- **§5.2:** model provider terms apply; we are responsible for complying.
- **Privacy:** Surplus doesn't store chat bodies by default; sellers and model providers do receive them.
- **Refunds:** card credit refundable only within 24 hours; deposited USDC is withdrawable.

### Live market snapshot (Claude models, 2026-10-30)

| Model | Median discount | Healthy sellers | Requests 24h | Uptime |
| --- | --- | --- | --- | --- |
| claude-opus-5.5 | 27% | 46 | 32,188 | 85% |
| claude-sonnet-5.5 | 23% | 37 | 21,847 | 86% |
| claude-haiku-5.5 | 34% | 22 | 28,264 | 70% |
| claude-sonnet-5 | 36% | 87 | 15,548 | 90% |
| claude-opus-4.8 | 29% | 56 | 4,466 | 99% |

Best-offer discounts reach 85–99%, but median is the realistic figure. Re-check `GET /api/markets` before each drop.

## Bankr

Runs an LLM gateway that is a major Surplus customer (about 401K requests in 30 days, 98.4% success, per Bankr's page). Builds on Base.

- **Checked (2026-10-30, Dan):** Bankr credit cannot be shared or split into keys for other people. Bankr is not a supply option for drops.
- **Role:** partner and distribution channel first; possible provider later; also the closest potential competitor.

## OpenRouter (fallback)

- Keys can be created by API with a USD `limit` and `limit_reset`; keys can be disabled.
- Use if Surplus terms, supply or quality become a problem, or as a second provider in Phase 4.

## Anthropic direct (not used)

Spend limits are per workspace and set by hand in the Console; API keys cannot be created by API. Not suitable for drops at scale.

## Provider adapter (Phase 4a — VERIFIED with the fake provider, commit `1edef71`)

All provider calls go through `src/providers/provider.ts` (`InferenceProvider`):

| Method | Purpose |
| --- | --- |
| `createKey` | Mint a capped, expiring, model-scoped key (idempotency key `oruno:claim:<id>:create`) |
| `rotateKey` | New secret under a new key id; old key retired; **new key capped at what's left** |
| `revokeKey` | Revoke; already-revoked or unknown counts as done |
| `getKeySpend` | Cumulative spend of one key |
| `setSpendCeiling` | Provider-side ceiling on total Oruno spend = funds held (funded − returned) |

Implementations:

| Provider | File | Status |
| --- | --- | --- |
| Fake | `src/providers/fake.ts` | VERIFIED: models caps (hard stop), expiry, model scope, idempotency, rotation, revocation, cumulative spend; injects retryable and permanent failures; can overshoot on purpose. `PROVIDER=fake` is refused in production |
| Surplus | `src/providers/surplus.ts` | **UNVERIFIED.** Written from the docs; request shapes tested with simulated HTTP only. Must pass Phase 4b before use |

### Surplus design notes (to confirm in Phase 4b)

- **One workspace.** An admin key mints keys only in its own workspace, so Oruno uses one Surplus workspace. Per-key caps isolate claims; the workspace ceiling bounds total spend.
- **Rotation can't reset a cap.** On Surplus, rotation creates a new key id that inherits the old budget. Its spend counter may start from zero, so Oruno sets the successor's budget to the remaining amount right after rotating.
- **Per-key budget uses `limit_month_micro`.** Drops stay inside one UTC month (TH-4).
- **Spend reading is OPEN.** `GET /v1/budgets/spend` is documented to return spend per budget, but its exact response shape isn't; the client parses `scope_type` / `scope_id` / `spent_micro` defensively.
- **HTTP 200 with an error body** is treated as a failure.

### Additional acceptance tests for Phase 4b

| # | Test | Pass condition |
| --- | --- | --- |
| AT-16 | Rotate a key that has spent part of its cap, then spend | Total spend across both keys ≤ original cap |
| AT-17 | Read `GET /v1/budgets/spend` for a key with known spend | Response shape matches the client's parsing; amount correct |
| AT-18 | Workspace ceiling below current key caps | Spend stops at the ceiling |
