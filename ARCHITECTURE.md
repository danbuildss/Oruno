# Architecture

**Status: APPROVED** (D-012, 2026-10-30). Stack details (frameworks) are proposed at Phase 1 start. Details: `docs/architecture/DATABASE.md`, `docs/architecture/PROVIDERS.md`, `docs/architecture/THREAT_MODEL.md`.

## Overview

```
Funder (operator in V1) ──► Oruno backend ──► Provider (Surplus)
                              │  drops · claims · ledger · eligibility · jobs
Claimer ──► claim page ──────►│  issues a personal capped key
                              │
Claimer's AI tool (Claude Code) ─────────────► Provider ──► AI models
                                (direct, with the personal key)
```

Oruno **issues and governs keys**; it does not sit in the request path (D-004). Claimers' prompts never touch Oruno.

## Modules (one deployable, D-005)

| Module | Responsibility |
| --- | --- |
| `config` | Environment configuration, secret loading, validation at startup |
| `identity` | Operator auth; claimer sign-in via X and GitHub OAuth; linked identities; eligibility signals |
| `drops` | Drop rules and lifecycle (draft, active, paused, ended) |
| `claims` | Claim creation, one-per-person enforcement, state transitions, revocation |
| `ledger` | Funding records, allocations, double-entry entries in micro-dollars, invariants, reconciliation |
| `providers` | Adapter interface + Surplus implementation + fake provider for tests |
| `jobs` | Usage sync, reconciliation, expiry checks |
| `audit` | Append-only record of administrative and security actions |
| `http` | API routes, validation, error mapping, rate limits, health check |

## Key flows

**Create a drop (operator):** confirm funding → create a drop → create a Surplus workspace budget equal to confirmed funding → activate.

**Claim:**
1. Claimer signs in with X or GitHub.
2. Eligibility check (account age, activity, not already claimed, drop active, claims remaining).
3. In one database transaction: reserve the cap from the drop's unallocated funds and create the claim (pending).
4. Mint a Surplus key (cap, expiry = drop end, model scope) with an idempotency key.
5. Mark the claim active; store the key id only; show the secret once.
6. On provider failure: retry with the same idempotency key; if it still fails, release the reservation and mark the claim failed.

**Daily jobs:** pull usage per key → snapshot → reconcile ledger with provider spend → flag differences over $0.01 → flag abuse signals.

## Two layers of money control (D-003)

1. **Our ledger:** Σ caps allocated ≤ confirmed funding, enforced in a transaction.
2. **Provider:** each key's hard cap, plus the workspace budget = funding, enforced on every request.

## Stack (D-005, APPROVED)

TypeScript (strict) on Node.js 22 · Postgres 16 · Fastify · Zod · Kysely (+ migrations) · pg-boss · pino · Vitest · Biome · pnpm (D-016) · Next.js for the Phase 6 claim page (to be confirmed then).

## Not in V1

Own gateway, message brokers, microservices, smart contracts, card payments, public API.
