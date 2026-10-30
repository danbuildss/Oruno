# Tasks

States: **BACKLOG · READY · IN PROGRESS · BLOCKED · IN REVIEW · VERIFIED**. Every task has a completion condition.

## Phase 0 — Research and Architecture

| ID | Task | State | Completion condition | Owner |
| --- | --- | --- | --- | --- |
| T-001 | Establish the documentation system | IN REVIEW | Files per `CLAUDE.md` exist and are populated without invented claims; Dan reviews | Claude |
| T-002 | Confirm the funding method for Drop #1 | VERIFIED | Dan confirmed USDC on Base (D-011) | Dan |
| T-003 | Create a Surplus organisation and an admin key | BACKLOG | Org and workspace exist; admin key stored in a secret store, not the repo | Dan (Claude guides) |
| T-004 | Ask Surplus the four open questions in writing | IN PROGRESS (Dan asking) | Written answers recorded in `docs/architecture/PROVIDERS.md` | Dan |
| T-005 | Check whether Bankr credit can be split into capped keys | VERIFIED (no — Dan checked: Bankr credit can't be shared) | Answer recorded in `docs/architecture/PROVIDERS.md` | Dan |
| T-006 | Provider spike: run AT-1 to AT-15 on a $20 Surplus key | BLOCKED (Dan will fund $20 soon; needs T-003) | Results with evidence in `TESTING.md` | Claude |
| T-007 | Decide eligibility thresholds (account age, activity) for X and GitHub | VERIFIED (approved, D-014) | Thresholds approved and recorded in `DECISIONS.md` | Claude proposes, Dan approves |
| T-008 | Check X and GitHub OAuth: which account-age and activity signals are available, at what cost | VERIFIED (findings accepted; field names to be confirmed against live docs in Phase 2) | Findings with sources in `docs/research/MARKET_RESEARCH.md` | Claude |
| T-009 | Draft claimer terms meeting Surplus §8 conditions | IN REVIEW (draft in `docs/legal/CLAIMER_TERMS.md`) | Draft reviewed by Dan; legal review scheduled | Claude drafts |
| T-010 | Approve V1 scope (`PRODUCT.md` → V1 boundaries) | VERIFIED | Approved by Dan (D-012) | Dan |
| T-011 | Approve architecture (`ARCHITECTURE.md`, DATABASE, THREAT_MODEL) | VERIFIED | Approved by Dan (D-012) | Dan |
| T-013 | Decide whether Drop #1 supports X sign-in (paid X API reads) or GitHub only | VERIFIED (GitHub only, D-014) | Dan decides; recorded in `DECISIONS.md` | Dan |
| T-012 | Trademark, domain, GitHub org and npm scope check for "Oruno" | BACKLOG (deferred by Dan to public launch; search found no conflicts) | Results recorded; any conflicts flagged | Claude researches |

Phase 0 closed by D-015. T-003, T-004, T-006 and T-009 carry forward as Phase 4 entry requirements.

## Phase 1 — Backend Foundation

| ID | Task | State | Completion condition |
| --- | --- | --- | --- |
| T-101 | Project scaffold (pnpm, TypeScript strict, Biome, Vitest) | VERIFIED | `pnpm typecheck`, `pnpm lint` and `pnpm test` run clean |
| T-102 | Configuration loading with validation (`.env.example`) | VERIFIED | Invalid or missing config stops startup with a clear error; unit tests |
| T-103 | Database connection and migrations (Kysely) | VERIFIED | Migrations apply and roll back on a clean database; tests |
| T-104 | Structured logging with secret redaction (pino) | VERIFIED | Test proves secrets don't appear in log output |
| T-105 | HTTP server, error handling, request validation (Fastify, Zod) | VERIFIED | Structured errors for validation, not-found and internal errors; tests |
| T-106 | Health check (process and database) | VERIFIED | `GET /health` reports database status; tests |
| T-107 | Operator authentication (hashed operator API keys) | VERIFIED | Valid key accepted; missing, wrong and disabled keys rejected; key never stored in plain text; tests |
| T-108 | Audit events for operator actions | VERIFIED | Operator key creation recorded; tests |
| T-109 | Background job runner (pg-boss) | VERIFIED | A test job is queued and processed against real Postgres |
| T-110 | CI (GitHub Actions with Postgres) | IN REVIEW (first run on PR #3) | Workflow file runs lint, typecheck, migrations and tests |
| T-111 | Phase 1 exit: docs, BP-1 and BP-2 evidence | VERIFIED (Dan approved exit) | `BACKEND_PROOF.md` BP-1 and BP-2 VERIFIED with evidence |

## Phase 2 — Drop and Claim Engine

| ID | Task | State | Completion condition |
| --- | --- | --- | --- |
| T-201 | Migration: people, identities, drops, claims, claimer sessions, OAuth states | VERIFIED | Applies and rolls back; constraints tested |
| T-202 | Drop rules and state machine (draft → active ⇄ paused → ended) | VERIFIED | Invalid drops and transitions rejected; unit and API tests |
| T-203 | Eligibility evaluation (D-013/D-014 thresholds) | VERIFIED | Unit tests for each threshold and boundary |
| T-204 | GitHub sign-in: state + PKCE, signals, sessions | VERIFIED (live GitHub not yet tested) | Replayed, expired or forged `state` rejected; tests with a fake GitHub; real client unit-tested |
| T-205 | Operator drop API | VERIFIED | Create, list, read, activate, pause, resume, end; audited; tests |
| T-206 | Claim API: one per person, slot limits, attestations, rate limits | VERIFIED | 100 concurrent claims on 20 slots → exactly 20; same person concurrently → 1; tests |
| T-207 | Revocation (operator and self) and drop-end expiry job | VERIFIED | State changes audited; tests |
| T-208 | Docs: `docs/architecture/API.md`, `docs/architecture/DROP_ENGINE.md`; evidence for BP-3, BP-5, BP-6 (slots) | IN REVIEW (awaiting Phase 2 exit approval) | Docs written; evidence recorded |

| T-209 | Create a GitHub OAuth App and test live sign-in | READY | Dan creates the app (free); live sign-in works end to end | Dan + Claude |

## Later phases

Tasks for Phases 3–7 are created when each phase is approved to start. See `PLAN.md`.
