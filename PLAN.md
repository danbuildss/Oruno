# Plan

Backend first. Each phase needs Dan's approval to start and to exit. All phases are **PROPOSED** unless marked otherwise.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Research and Architecture | CLOSED (D-015) |
| 1 | Backend Foundation | CLOSED (approved 2026-10-30) |
| 2 | Drop and Claim Engine | CLOSED (approved 2026-10-30) |
| 3 | Credit Ledger and Funding | IN PROGRESS |
| 4 | Provider Integration (key issuance) | Not started |
| 5 | Backend Reliability and Verification | Not started |
| 6 | Claim Frontend | Not started |
| 7 | Controlled Pilot — Drop #1 | Not started |

---

## Phase 0 — Research and Architecture

- **Objective:** a sound, evidence-based V1 scope and architecture.
- **Scope:** provider capabilities and terms; competitors; anti-abuse approach; funding method; architecture, database and threat model; validation plan.
- **Dependencies:** none.
- **Deliverables:** `docs/research/*`, `ARCHITECTURE.md`, `docs/architecture/DATABASE.md`, `docs/architecture/PROVIDERS.md`, `docs/architecture/THREAT_MODEL.md`, answers to the Phase 0 questions in `TASKS.md`, the provider spike results.
- **Acceptance criteria:** every Phase 0 question answered or explicitly accepted as a risk; V1 scope and architecture approved.
- **Testing:** provider spike (AT-1 to AT-15 in `TESTING.md`) on a $20 test key, **only after spending approval**.
- **Exit:** Dan approves V1 scope, architecture and Phase 1 start.
- **Approval:** spending the $20 test key; V1 scope; architecture.

## Phase 1 — Backend Foundation

- **Objective:** a tested, running backend skeleton.
- **Scope:** configuration and secrets loading, Postgres, migrations, operator authentication, request validation, error handling, structured logging, background job runner, health check, test infrastructure (real database in tests).
- **Dependencies:** Phase 0 approved; stack decision approved (D-005).
- **Deliverables:** `src/` skeleton, migrations, `.env.example`, CI-runnable tests.
- **Acceptance criteria:** service starts; health check passes; migrations apply and roll back; tests run against a real Postgres.
- **Testing:** unit, database and API tests.
- **Exit:** tests green; `NOTES.md` updated.
- **Approval:** phase start and exit.

## Phase 2 — Drop and Claim Engine

- **Objective:** drops and claims with eligibility and anti-abuse, without real money.
- **Scope:** drop model (total, cap, max claims, models, window, status: draft/active/paused/ended); GitHub identity verification with the D-014 account-age and activity thresholds (X sign-in later); one claim per person per drop and across linked identities; claim rate limits; claim state transitions (pending, active, exhausted, expired, revoked); revocation; audit history.
- **Dependencies:** Phase 1.
- **Deliverables:** engine module, API endpoints, `docs/architecture/DROP_ENGINE.md`, `docs/architecture/API.md`.
- **Acceptance criteria:** duplicate and ineligible claims rejected; claims never exceed max claims under concurrency; all transitions audited.
- **Testing:** unit, integration, concurrency, security tests.
- **Exit:** tests green; reviewed.
- **Approval:** phase start and exit; eligibility thresholds.

## Phase 3 — Credit Ledger and Funding

- **Objective:** money is always accounted for and can never be over-allocated.
- **Scope:** funding records (confirmed deposits only); double-entry, append-only ledger in micro-dollars; allocation of caps to claims; atomic reservation so concurrent claims can't allocate the same funds; reconciliation against provider usage; financial invariants.
- **Dependencies:** Phase 2.
- **Deliverables:** ledger module, `docs/architecture/CREDIT_LEDGER.md`, invariant tests.
- **Acceptance criteria:** invariants hold under concurrency (Σ caps ≤ confirmed funding; ledger balances to zero; no negative balances); reconciliation detects any mismatch over $0.01.
- **Testing:** financial invariant, concurrency, failure-recovery tests.
- **Exit:** tests green; reviewed.
- **Approval:** phase start and exit; funding method.

## Phase 4 — Provider Integration (key issuance)

- **Objective:** claims become real, capped provider keys, safely.
- **Scope:** provider adapter interface; Surplus implementation (create workspace budget, mint key with cap, expiry and scope, update cap, revoke, rotate, read usage); idempotency keys; retries with limits; error mapping; daily usage sync; reconciliation job; a fake provider for tests.
- **Dependencies:** Phase 3; Surplus admin key (T-003); Surplus written answers (T-004); provider spike AT-1 to AT-15 passed (T-006) — moved here by D-015.
- **Deliverables:** `src/providers/`, updated `docs/architecture/PROVIDERS.md`.
- **Acceptance criteria:** AT-1 to AT-15 pass against a real Surplus key; no secret is ever stored or logged.
- **Testing:** integration tests against the fake provider; controlled tests against Surplus with the $20 key.
- **Exit:** acceptance tests VERIFIED with evidence.
- **Approval:** phase start and exit; any real-money test.

## Phase 5 — Backend Reliability and Verification

- **Objective:** prove the backend works under normal and abnormal conditions.
- **Scope:** scenarios in `TESTING.md` → Failure recovery and Security, including duplicate and replayed claims, invalid sessions, expired and paused drops, exhausted funding, concurrent claims, provider timeouts and errors, worker crashes, restarts, transaction failures and partial failures.
- **Dependencies:** Phases 1–4.
- **Deliverables:** completed `BACKEND_PROOF.md`.
- **Acceptance criteria:** every `BACKEND_PROOF.md` item VERIFIED with reproducible evidence.
- **Exit:** Dan approves the backend proof.
- **Approval:** required to start frontend.

## Phase 6 — Claim Frontend

- **Objective:** the smallest UI that exposes verified backend capabilities.
- **Scope:** claim page (sign in, eligibility result, claim, show key once, setup steps); "my key" page (balance, setup, self-revoke); minimal operator view. Nothing the backend doesn't support.
- **Dependencies:** approved `BACKEND_PROOF.md`.
- **Acceptance criteria:** end-to-end claim works in a staging environment.
- **Testing:** end-to-end tests.
- **Approval:** phase start and exit.

## Phase 7 — Controlled Pilot (Drop #1)

- **Objective:** run Drop #1 safely and learn. See `docs/research/VALIDATION.md`.
- **Scope:** deployment, environment separation, secret management, backups, monitoring, alerts, runbook, reconciliation procedure, security review, claimer terms.
- **Dependencies:** Phase 6; legal and terms checks; funding approved.
- **Deliverables:** `docs/operations/*`; Drop #1 results in `docs/project/EXPERIMENTS.md`.
- **Exit:** results reviewed; decision on the next stage.
- **Approval:** deployment, funding, launch.

---

## Future stages (not planned yet)

Anyone can fund a drop → organisations → infrastructure for apps → onchain funding on Base → open network and agents. See `PRODUCT.md` → Long-term direction. Each requires a new plan and approval.
