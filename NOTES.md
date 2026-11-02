# NOTES — Project memory

**Read this before any task.** Update it after every meaningful session. History lives in `docs/project/SESSION_LOG.md`; don't delete context, move it there.

_Last updated: 2026-11-02_

## 1. Current project status

Phases 0–5 closed (5 for the fake provider). Phase 6 merged (PR #8); its exit waits for a staging claim. Phase 7 preparation done on branch `phase7/deploy-prep` (D-025: website on Vercel, API + jobs in one container); nothing deployed. Phase 4b (real Surplus) blocked on T-003/T-004/T-006. Hosting: Vercel option B (D-025); API host, Postgres provider and domain OPEN. No money spent. Nothing deployed.

Naming (D-022): people see **pool** and **credit**; code and engineering docs keep **drop**.

## 2. Current development phase

**Phase 7 — Pilot, preparation only** (no deploy, no spending). Phase 4b blocked. See `PLAN.md`.

## 3. Last completed task

Phase 7 prep: T-701 to T-705 (CI browser tests, TRUST_PROXY, vercel.json, Dockerfile, DEPLOYMENT.md). Phase 6: T-601 to T-608 VERIFIED (commits `965d04b`, `275c057`). T-609 (staging) waits for Phase 7 and D-024. Live GitHub sign-in (T-209) still needs a GitHub OAuth App.

## 4. Current implementation state

Backend skeleton in `src/` (branch `phase1/backend-foundation`):
- config validation (`src/config.ts`);
- Postgres via Kysely with migrations (`src/db/`); tables `operators`, `audit_events` (append-only);
- pino logging with secret redaction (`src/logger.ts`);
- Fastify app with structured errors (`src/app.ts`, `src/http/`);
- `GET /health`, `GET /v1/operator/me`;
- hashed operator API keys + `pnpm operator:create` (`src/auth/`, `src/cli/`);
- pg-boss job runner (`src/jobs/`);
- tests in `tests/`; CI in `.github/workflows/ci.yml`.

Phase 2 adds (branch `phase2/drop-claim-engine`):
- GitHub sign-in with state + PKCE (`src/auth/claimer-auth.ts`, `src/github/`);
- eligibility (`src/eligibility/`);
- drops and their rules (`src/drops/`);
- claims, revocation and the expiry job (`src/claims/`);
- routes (`src/http/routes/`);
- rate limits;
- migration 0002.

Claims stay `pending` (no keys yet). API reference: `docs/architecture/API.md`; design: `docs/architecture/DROP_ENGINE.md`.

Phase 3 adds (branch `phase3/credit-ledger`): double-entry ledger with database-enforced rules (`src/ledger/`, migration 0003), funding records, allocation on claim, funding check on activation, releases, returns, invariant checker, jobs `claims.release` and `ledger.check`. Design: `docs/architecture/CREDIT_LEDGER.md`.

Phase 4a adds (branch `phase4/provider-integration`): provider adapter, fake provider, Surplus client (UNVERIFIED), key issuance with secret shown once, retries, reveal/rotate (remaining-cap successor), revocation at the provider, spend sync with overshoot flagging, spend ceiling, 4 new jobs, migration 0004. Config `PROVIDER=none|fake|surplus` (fake refused in production).

Phase 7 prep adds (branch `phase7/deploy-prep`): `TRUST_PROXY` for client IPs behind proxies; shared security headers (`src/http/security-headers.ts`); `vercel.json`; `Dockerfile` + `.dockerignore`; CI e2e job; `docs/operations/DEPLOYMENT.md`.

Phase 6 adds (branch `phase6/claim-frontend`): cookie sessions with CSRF guard, browser sign-in redirects, `/v1/me`, `/v1/drops/:slug/eligibility`, website serving with security headers; the React site in `web/` (pool page, claim, key shown once, My credit); Playwright tests in `e2e/` (`pnpm e2e`).

Phase 5 adds (branch `phase5/reliability`): database statement/lock timeouts with retryable 503s, per-connection error listeners, job retries with backoff, startup refusal with pending migrations, HTTP timeouts, orphan provider key reconciliation (`keys.reconcile`), failure tests. Runbook draft: `docs/operations/RUNBOOK.md`. 

## 5. What is working

Verified on commit `4734e4b` (36/36 tests, lint, typecheck, build; manual start-up check). See `TESTING.md`:
config validation; migrations up/down; append-only audit log; health check; operator key auth; secret redaction in logs; error responses; background jobs.

Verified on commit `33466ef` (108/108 tests): drops and state machine; GitHub sign-in flow (fake GitHub with PKCE); eligibility; claims with concurrency safety; revocation; expiry job; rate limits.

Verified on commit `2f6d4db` (127/127 tests): ledger rules in the database; funding; allocation under concurrency; activation funding check; releases; returns; invariant checker; randomized invariant test.

Verified on commit `1edef71` (158/158 tests) **with the fake provider only**: key issuance, outages and retries, crash recovery, rotation, revocation, spend sync, overshoot, ceiling, randomized test with spend.

Verified on commits `965d04b`/`275c057` (180/180 tests + 7/7 browser tests): cookie and CSRF rules; the whole claim flow in a real browser on mobile and desktop; secret never stored by the browser; no CSP violations.

Verified on commit `9a892fe` (171/171 tests): partial-transaction failures leave nothing behind; lock/statement timeouts and database outages return retryable 503s; killed connections recover without a crash; job retries and restarts; orphan key cleanup; `kill -9` restart.

## 6. What is broken

Nothing known.

## 7. Known limitations (from research, not yet tested)

- Surplus budgets have day and month windows only; no lifetime window found. A monthly cap can double if a drop crosses a month boundary.
- Surplus charges a per-request flat fee ($0.003 per `/x402/info`); unconfirmed whether it applies to API-key traffic. Could take a large share of a $5 cap.
- On Surplus's Anthropic endpoint, "out of credit" appears as a generic `400 invalid_request_error`. Claimers need clear onboarding text.
- Surplus verifies seller reachability and health, not model quality (weights, quantization, injected prompts).

## 8. Outstanding bugs

None known.

## 9. Important architectural decisions

See `DECISIONS.md`. Summary:
- APPROVED: D-001 credit drops first · D-002 Surplus Pattern A · D-006 name Oruno · D-007 Apache-2.0 · D-008 X/GitHub sign-in, wallet optional · D-009 $5 cap · D-010 backend-first process · D-011 funding in USDC on Base.
- APPROVED (via D-012): D-003 provider caps + our ledger · D-004 no own gateway in V1 · D-005 TypeScript + Postgres monolith · V1 scope.
- APPROVED: D-013 eligibility thresholds · D-014 GitHub-only sign-in for Drop #1 · D-015 Phase 0 closed, Surplus spike moved before Phase 4 · D-016 Phase 1 stack.

## 10. Pending approvals

| Item | Where | Notes |
| --- | --- | --- |
| **API host + managed Postgres + Vercel plan + domain; spending** | T-706, `docs/operations/DEPLOYMENT.md` | Option B approved (D-025); providers and costs not yet chosen |
| Staging deployment | T-707 | After T-706, T-209 and deploy approval |
| **Phase 4b (real Surplus)** | T-003, T-004, T-006, T-411 | Surplus answers; Surplus org + admin key + workspace id; **$20 USDC test deposit**; then AT-1 to AT-18 |
| GitHub OAuth App | T-209 | Free; needed to test live sign-in |
| Claimer terms draft | T-009, `docs/legal/CLAIMER_TERMS.md` | Then a lawyer review |
| Spending: $20 test key | T-006 | Deferred by Dan ("5 later") |

## 11. Next recommended task

1. Dan: review the Phase 7 prep PR; choose API host, Postgres, domain; approve spending (T-706).
2. Dan: GitHub OAuth App(s) (T-209) — callback on the Vercel site, see DEPLOYMENT.md.
3. Phase 4b: Surplus answers (T-004), Surplus org + admin key + workspace id (T-003), $20 USDC deposit approval (T-006).
4. Claimer terms legal review (T-009); the website links the DRAFT terms.
5. Then Phase 7 (deployment) with approval.

## 12. Relevant commits

- `5f96e34` Initial commit
- `ed7936e` First foundation docs (superseded by `c3b2a76`)
- `c3b2a76` Documentation system and Apache-2.0 license
- `4d32768` Funding decision D-011
- `c2ca114` V1 scope and architecture approval; sign-in research; draft claimer terms
- `121e193` D-014 GitHub-only sign-in; name check
- `a26e9b9` Bankr answer; name registration deferred
- `db5af0c` D-015, D-016; Phase 1 tasks
- `4734e4b` **Phase 1 backend foundation**
- `8977919` Phase 1 evidence
- `8586a33` D-017; Phase 2 tasks
- `33466ef` **Phase 2 drop and claim engine**
- `4adb20f` Phase 2 evidence; `27349b9` CI pass on PR #3
- `80d7efc` D-018; Phase 3 tasks
- `2f6d4db` **Phase 3 credit ledger and funding**
- `fa09579` Phase 3 evidence
- `5921a17` D-019; Phase 4a tasks
- `1edef71` **Phase 4a provider integration (fake provider)**
- `fb8eb75` Phase 4a evidence
- `d65cb26` D-020 research directions; D-021 Phase 5
- `9a892fe` **Phase 5 reliability**
- `453bd98` D-022, D-023; Phase 6 tasks
- `965d04b` **Website backend** (cookies, CSRF, eligibility, static)
- `275c057` **Claim website and browser tests**
- `7b9c6e3` Merge PR #8 (Phase 6)
- `c4dcca3` D-025; Phase 7 prep tasks

## 13. Important testing results

2026-10-30, `4734e4b`: 36/36 tests pass on real Postgres 16; lint, typecheck and build clean; manual start-up, health, auth, graceful shutdown and migration round trip all as expected.

2026-10-30, `33466ef`: 108/108 tests; 100 concurrent claims on 20 slots → exactly 20; one person ×10 → 1; replayed, expired and forged sign-in state refused; PKCE mismatch refused.

2026-10-30, `2f6d4db`: 127/127 tests; 100 concurrent claims on a drop funded for 10 → exactly 10, never negative; database refuses unbalanced, edited and overdrawn ledger records; tampering detected; invariants hold after every step of 3×250 randomized operations.

2026-10-30, `1edef71`: 158/158 tests with the fake provider; secret never stored or logged; one key under crash recovery and concurrent attempts; rotation can't reset a cap; overshoot capped and flagged; invariants hold over 200 randomized steps with spend.

2026-11-02, `275c057`: 180/180 tests; 7/7 browser tests (Chromium, mobile and desktop). Full log in `TESTING.md`.

2026-11-02, `9a892fe`: 171/171 tests; found and fixed a crash on dropped database connections; restarts and crashes recover cleanly. Full log in `TESTING.md`.

## 13b. Environment note

The local Postgres stops when the cloud environment restarts. If tests fail at startup with a connection error, run `pg_ctlcluster 16 main start`.

## 14. Deployment status

Nothing deployed. No environments exist. Local development only. Plan: Vercel + one API container + managed Postgres (D-025). Docker image built and run locally only.

## 15. Unresolved technical questions

**Surplus (ask in writing, T-004):**
1. Is there a lifetime budget window?
2. Does the per-request flat fee apply to API-key traffic?
3. Which sellers serve Claude models, and is that supply legitimately sourced under model providers' terms?
4. Would a future Oruno gateway count as a "directly competing routing service" (§8)?

**Bankr (T-005):** answered — credit can't be shared. Partnership interest still open for later.

**Ours:**
- Confirm GitHub and X field names and pricing against the live official docs (blocked in this session) at Phase 2 start.
- How we detect key sharing with only provider usage data (IPs may not be visible).
- How many proxy hops to trust behind Vercel's rewrite (TRUST_PROXY) — verify on staging.
- Rate limits and the CSRF/cookie design assume one origin; keep `/v1` same-origin on Vercel (rewrite) or revisit.
- Rate limits are in-memory (single instance); revisit if Oruno runs more than one instance.
- Funding is operator-attested; add on-chain verification of the Base transaction hash later.
- Surplus `GET /v1/budgets/spend` response shape (AT-17) and whether rotation resets key budgets (AT-16) — Phase 4b.
- Orphan provider key if the provider created a key but Oruno never received the response and the claim later failed: its secret was never delivered, and the workspace ceiling bounds it. Consider a provider-side key listing to clean up in Phase 4b.
- Who does the one-hour legal review of claimer terms (T-009).
