# Changelog

Significant changes to the repository, newest first.

## 2026-11-02
- UI fixes from the improve-ui audit (approved by Dan): claimer-facing errors say "pool" (design plan 001); red removed, black and white only (design plan 002).
- **Phase 6 claim website** (`965d04b`, `275c057`): cookie sessions with CSRF guard, browser sign-in, eligibility endpoint, website served by the API server; React site (pool page, claim, key shown once, My credit); Playwright end-to-end tests.
- Decisions D-022 (user-facing word "pool"), D-023 (website design), D-024 (hosting on Vercel; backend option OPEN).
- **Phase 5 reliability** (`9a892fe`): timeouts, crash-safe connections, job retries, startup migration check, orphan key cleanup, failure tests. Runbook draft.
- Research recorded as proposed future directions (D-020).

## 2026-10-30
- **Phase 4a provider integration (fake provider)** (`1edef71`): provider adapter, fake provider, Surplus client (unverified), key issuance and recovery, rotation, revocation at the provider, spend sync, overshoot flagging, spend ceiling.
- **Phase 3 credit ledger and funding** (`2f6d4db`): double-entry ledger with database-enforced rules, USDC-on-Base funding records, allocation on claim, activation funding check, releases, returns, invariant checker. Docs: CREDIT_LEDGER.
- **Phase 2 drop and claim engine** (`33466ef`): GitHub sign-in (state + PKCE), eligibility, drops, claims with concurrency safety, revocation, expiry job, rate limits. Docs: API, DROP_ENGINE.
- **Phase 1 backend foundation** (`4734e4b`): config, Postgres migrations, append-only audit log, logging with redaction, Fastify error handling, health check, operator API keys, pg-boss jobs, Vitest suite, CI.
- Recorded D-015 and D-016.
- Recorded D-014 (D-013 approved; GitHub-only sign-in for Drop #1) and the "Oruno" name check.
- Recorded approvals D-011 (USDC on Base) and D-012 (V1 scope and architecture); proposed D-013 (eligibility thresholds).
- Added sign-in signal research to `docs/research/MARKET_RESEARCH.md`.
- Added draft claimer terms in `docs/legal/CLAIMER_TERMS.md`.
- Established the documentation system (`CLAUDE.md`, `NOTES.md`, `PRODUCT.md`, `PLAN.md`, `TASKS.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `TESTING.md`, `BACKEND_PROOF.md`, `docs/research/*`, `docs/architecture/*`, `docs/project/*`).
- Added the Apache-2.0 `LICENSE`.
- Replaced the first draft docs layout (`docs/VISION.md`, `docs/ROADMAP.md`, etc.) with this structure; content carried over.
