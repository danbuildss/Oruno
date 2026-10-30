# Changelog

Significant changes to the repository, newest first.

## 2026-10-30
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
