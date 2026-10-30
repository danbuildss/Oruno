# Architecture

## Overview

```
Funder ──► Drop page ──► Oruno core (drops · claims · ledger · anti-abuse)
                                     │
Claimer ─► Claim page ──► personal capped key ──► Provider (Surplus) ──► AI models
                                     │
                         Usage sync · reconciliation · reports · (later) onchain funding
```

Requests from a claimer's tool go **straight to the provider** with their personal key. Oruno is not in the request path in Phases 1–3. It issues keys, sets caps, and reads usage. A gateway of our own is considered only in Phase 4, if apps need it.

## The core engine

| Part | Responsibility |
| --- | --- |
| **Drops** | Rules: funder, total, cap per person, max claims, eligibility, models, start and end |
| **Claims** | Who joined, which key they hold, status (active, exhausted, expired, revoked) |
| **Ledger** | Every money movement in integer micro-dollars: funded, allocated to keys, spent, returned. Always reconciles with the provider |
| **Eligibility & abuse** | Sign-in checks, one claim per person, rate limits, flags, revocation |
| **Provider adapter** | The only code that talks to a provider: create key, set cap, expire, revoke, read usage |

## What the provider does vs what we do

| Capability | Surplus | Oruno |
| --- | --- | --- |
| Create, rotate, revoke keys | Yes (admin key, `/v1/keys`) | Decides when; keeps an audit log |
| Hard cap per key | Yes (`budget`, `hard_stop`) | Chooses the cap; tests it holds |
| Never exceed the drop's funding | Yes, nested workspace budget | Sets the workspace budget = funded amount |
| Expiry | Yes (`expires_in_seconds`) | Sets it to the drop's end date |
| Model restrictions | Yes (`scope.models`, `trusted_only`) | Chooses models |
| Usage per key | Yes (`/v1/requests`, export, webhooks) | Syncs daily; builds reports |
| Eligibility, anti-abuse, claim UX | No | Yes |
| Funder accounts, dashboards, reports | No | Yes |
| Ledger across funders and drops | No | Yes (Phase 2) |

## Mapping to Surplus

- One Surplus **organisation** for Oruno.
- One Surplus **workspace per drop** (or per funder) with a workspace budget equal to the confirmed funding. Surplus will not let keys inside it spend beyond that.
- One **buyer key per claim**, minted by Oruno's admin key with a cap, an expiry and a model scope.
- Max 200 active keys per workspace; larger drops span several workspaces.

## Stack

- **Language:** TypeScript (Node.js)
- **Web:** Next.js for claim and funder pages
- **API:** Fastify, inside one modular monolith
- **Database:** Postgres (strict transactions for the ledger); SQLite acceptable for Phase 1 tooling only
- **Jobs:** scheduled usage sync and reconciliation
- **Auth:** X and GitHub OAuth; Sign-In With Ethereum for Base wallets
- **Payments:** USDC on Base deposited to the provider account; card later
- **Onchain (Phase 5):** a funding pool contract on Base

## Data model (initial)

| Table | Purpose |
| --- | --- |
| `users` | Funders, claimers, operators; linked sign-in identities |
| `identities` | X / GitHub / wallet accounts with age and activity signals |
| `funders` | Individuals or organisations funding drops |
| `drops` | Rules, status, provider workspace id |
| `fundings` | Confirmed deposits backing a drop (tx hash or payment id) |
| `claims` | One row per claimer per drop; provider key id; status |
| `ledger_entries` | Append-only, double-entry money movements in micro-dollars |
| `usage_snapshots` | Daily per-key usage pulled from the provider |
| `outcomes` | What claimers chose to share |
| `abuse_flags` | Signals and actions taken |
| `audit_events` | Every admin and security action |

## Planned repo layout

```
oruno/
├── README.md
├── NOTES.md
├── CLAUDE.md
├── docs/
│   ├── VISION.md  PRODUCT.md  ARCHITECTURE.md  PROVIDERS.md
│   ├── SAFETY.md  BUSINESS_MODEL.md  ROADMAP.md  DROP_1.md
│   ├── ACCEPTANCE_TESTS.md  RESEARCH.md
│   └── decisions/
├── apps/
│   ├── web/              Next.js: claim page, my-key page, funder pages (Phase 1–2)
│   └── api/              Fastify: drops, claims, ledger, jobs
├── packages/
│   ├── core/             drops, claims, eligibility (pure logic + tests)
│   ├── ledger/           double-entry ledger (Phase 2)
│   ├── providers/        provider adapter interface + surplus/ (+ openrouter/, bankr/ later)
│   └── sdk/              TypeScript SDK (Phase 4)
├── contracts/            Base funding pool (Phase 5)
├── db/migrations/
└── tests/
    ├── unit/
    ├── integration/
    └── acceptance/       AT-1 … AT-15 against a real provider key
```

Folders are created only when their phase starts.
