# Session log

Newest first. Each entry: Completed · Verified · Not verified · Issues · Next.

## 2026-10-30 (4) — Phase 1 backend foundation

**Completed**
- D-015 (Phase 0 closed; Surplus spike before Phase 4) and D-016 (Phase 1 stack) recorded.
- Built the backend foundation: config, migrations, append-only audit log, logging with redaction, error handling, health check, operator keys, job runner, tests, CI workflow. Commit `4734e4b`.

**Verified**
- 36/36 tests on real Postgres; lint (rules confirmed active), typecheck, build.
- Manual start-up from the build: health 200, auth 200/401, key never in logs, graceful shutdown, migration round trip, production rollback guard, bad config refused.

**Not verified**
- CI on GitHub (no run yet).

**Issues**
- Typecheck caught a test that built its header before the key existed (it was testing `Basic undefined`); fixed, and a "key without scheme" case added.
- Biome's automatic config migration set lint rules to "none"; corrected to "recommended" and confirmed rules fire.

**Next**
- Dan: Phase 1 exit approval; pull request so CI runs.

## 2026-10-30 (3) — Eligibility approved, name check

**Completed**
- Recorded D-014: D-013 thresholds approved; Drop #1 uses GitHub sign-in only.
- T-012: name check for "Oruno".

**Verified**
- npm package name `oruno` is unpublished (registry 404).

**Not verified**
- Domains and GitHub org availability (blocked in this session); formal trademark search not done.

**Issues**
- None blocking.

**Next**
- Dan's Phase 0 items (T-003, T-004, T-005, T-009 review, T-012 follow-up), then the $20 provider spike when approved.

## 2026-10-30 (2) — Approvals, sign-in research, claimer terms

**Completed**
- Recorded Dan's approvals: V1 scope and architecture (D-012), funding in USDC on Base (D-011).
- T-008: researched GitHub and X sign-in signals and costs.
- Proposed eligibility thresholds (D-013) and a GitHub-only option for Drop #1 (T-013).
- T-009: drafted claimer terms (`docs/legal/CLAIMER_TERMS.md`).

**Verified**
- Surplus Terms §2 eligibility (13+, under-18 needs permission, sanctions exclusions) read from the live terms page.

**Not verified**
- GitHub and X field names and X pricing: taken from search results quoting official docs; docs.github.com and docs.x.com were blocked in this session.

**Issues**
- None blocking.

**Next**
- Dan: decide D-013 and T-013; review claimer terms.
- Claude: T-012 name checks.

## 2026-10-30 — Research, pivot, documentation system

**Completed**
- Researched the idea end to end: competitors, Surplus docs, terms and live market, Anthropic and OpenRouter key controls, Bankr's role.
- Pivoted from a corporate sponsorship pilot to credit drops (D-001).
- Dan approved: name Oruno, Apache-2.0, X/GitHub sign-in with wallet optional, $5 cap, backend-first process.
- Established the documentation system and added the license.

**Verified**
- Surplus API and docs reachable; live market data pulled from `/api/markets` and `/x402/info`.
- Apache-2.0 text downloaded from apache.org (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`).

**Not verified**
- Any Surplus key behaviour (caps, expiry, budgets): no key created, no money spent.
- Bankr key controls.
- X and GitHub eligibility signals.

**Issues**
- None open. Funding method confirmed later in the session: USDC on Base (D-011).

**Next**
- Dan: review V1 scope and architecture, send Surplus questions, check Bankr.
- Claude: research X and GitHub sign-in signals (T-008).
