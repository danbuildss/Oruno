# API

**Status: VERIFIED through Phase 4a with the fake provider** (commits `33466ef`, `2f6d4db`, `1edef71`; see `TESTING.md`). Base path `/`. JSON in and out.

## Conventions

- **Money** is always a string of integer micro-dollars (`"5000000"` = $5.00). Never a float.
- **Times** are ISO 8601 with a timezone.
- **Errors** share one shape:

```json
{ "error": { "code": "drop_full", "message": "All slots in this drop have been claimed.", "details": {} }, "requestId": "req-1" }
```

- **Auth:**
  - Operators: `Authorization: Bearer oru_op_…` (created with `pnpm operator:create`).
  - Claimers: `Authorization: Bearer oru_cs_…` (returned by the GitHub sign-in callback; valid 24 hours).

## Routes

### System

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | `200 {status:"ok",database:"ok"}` or `503 {status:"degraded",database:"unavailable"}` |
| GET | `/v1/operator/me` | operator | The calling operator |

### Drops (operator)

| Method | Path | Body / result |
| --- | --- | --- |
| POST | `/v1/drops` | Create a draft. Body: `slug`, `name`, `capMicro` (string), `maxClaims`, `models[]`, `startsAt`, `endsAt`, `termsVersion`, optional `eligibility {minAccountAgeDays, minPublicRepos, minContributions}` (defaults 180 / 3 / 20). `201` drop. Errors: `validation_error`, `slug_taken` |
| GET | `/v1/drops` | All drops |
| GET | `/v1/drops/:id` | One drop |
| POST | `/v1/drops/:id/activate` | draft → active. `drop_window_over` if the window has passed |
| POST | `/v1/drops/:id/pause` | active → paused |
| POST | `/v1/drops/:id/resume` | paused → active |
| POST | `/v1/drops/:id/end` | active or paused (or draft) → ended |
| GET | `/v1/drops/:id/claims` | Claims on a drop |
| POST | `/v1/claims/:id/revoke` | Body `{reason}`. Revoke any claim |

Invalid transitions return `409 invalid_transition`. Activate and resume return `409 insufficient_funding` (with `requiredMicro` and `unallocatedMicro`) unless the drop's unallocated funds cover cap × open slots.

### Funding and ledger (operator)

| Method | Path | Body / result |
| --- | --- | --- |
| POST | `/v1/drops/:id/fundings` | Record a confirmed USDC-on-Base deposit: `{amountMicro, reference: "0x…64 hex", note?}`. `201 {funding, balances}`. Errors: `duplicate_reference`, `drop_ended` |
| GET | `/v1/drops/:id/balances` | `{fundedMicro, unallocatedMicro, allocatedMicro, spentMicro, returnedMicro}` |
| POST | `/v1/drops/:id/returns` | After the drop ends: `{amountMicro?, reference}` (defaults to all unallocated). Errors: `drop_not_ended`, `insufficient_funding`, `nothing_to_return`, `duplicate_reference` |
| POST | `/v1/claims/:id/release` | Release an ended claim's unused allocation now. `{releasedMicro}`. Error: `claim_still_open` |
| GET | `/v1/ledger/check` | `{ok, violations[]}` from the invariant checker |

### Drops (public)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/public/drops/:slug` | What a claim page shows: name, status, cap, slots left, models, window, terms version, eligibility. Drafts are `404` |

### Sign-in (GitHub)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/auth/github/start?drop=<slug>` | Returns `{authorizeUrl}` (with single-use `state` and a PKCE S256 challenge). Rate-limited 20/min/IP |
| GET | `/v1/auth/github/callback?code&state` | Completes sign-in. Returns `{sessionToken, expiresAt, login, drop}`. Errors: `invalid_state` (forged, expired after 10 min, or reused), `github_unavailable`, `person_blocked`. Rate-limited 20/min/IP |
| POST | `/v1/auth/sign-out` | Revokes the current session. `204` |

Returns `503 github_not_configured` until a GitHub OAuth App is configured (`GITHUB_*` settings).

### Claims (claimer)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/drops/:slug/claims` | Body `{termsVersion, acceptTerms: true, confirmAdult: true, confirmNotSanctioned: true}`. **`201 {claim, key}`** — `key = {secret, prefix, setup: {ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY}}`, shown **once**. `202 {claim, key: null}` if the provider is briefly unavailable (a job keeps trying; fetch the key later). Errors: `terms_outdated`, `drop_not_active`, `drop_not_started`, `drop_ended`, `drop_full`, `already_claimed`, `not_eligible` (with `details.reasons`), `insufficient_funding`, `key_issue_failed` (502; you may claim again), `provider_not_configured` (503). Rate-limited 10/min/IP |
| POST | `/v1/me/claims/:id/key` | Get the key for an active claim (first time after a delayed issuance), or replace a lost one: `{key}`. The old secret stops working; the new key holds what's left of the cap. Max 3 replacements (`429 rotation_limit`). Rate-limited 5/min/IP |
| GET | `/v1/me/claims` | The caller's claims, with `spentMicro`, `remainingMicro` and `keyPrefix` |
| POST | `/v1/me/claims/:id/revoke` | Revoke one's own claim |

Rate-limited requests return `429 rate_limited`.

## Not yet available

Real Surplus keys (Phase 4b). With `PROVIDER=fake`, keys are simulated and don't work in Claude Code.
