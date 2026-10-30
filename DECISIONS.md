# Decisions

Append-only. Never edit a past decision's substance; to change one, add a new entry that supersedes it and mark the old one "Superseded by D-NNN".

---

## D-001 — Credit drops shared by link are the first product

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** What to build first.
- **Options:** (a) corporate sponsorship pilot sold to one organisation; (b) credit drops anyone can fund and share by link.
- **Selected:** (b).
- **Reasoning:** Matches the real goal: let people who can't afford subscriptions use AI for free, shared publicly without meeting each person.
- **Trade-offs:** Public links attract farming, so anti-abuse is core from day one. Organisation sales move later.
- **Consequences:** Drop #1 is self-funded; eligibility and anti-abuse are V1 requirements.

## D-002 — Surplus Intelligence Pattern A is the first provider

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Where AI credit comes from, and how per-person caps are enforced.
- **Options:** Anthropic direct (caps per workspace, set by hand; keys not creatable by API); OpenRouter (keys with USD limits by API); Surplus (keys with caps, expiry, scopes and nested budgets by API; Base-native; terms allow reselling with conditions).
- **Selected:** Surplus, Pattern A: one provisioned buyer key per claimer, minted with an admin key. OpenRouter as fallback.
- **Reasoning:** Has every control V1 needs; aligned with Base and Bankr; 20–35% median discount on Claude models.
- **Trade-offs:** Marketplace supply isn't verified for model quality; terms §8 conditions apply; single-provider dependency until a second is added.
- **Consequences:** All provider calls go through an adapter; `trusted_only` routing; open questions tracked in `NOTES.md`.

## D-003 — Rely on provider-enforced caps in addition to our own ledger

- **Date:** 2026-10-30 · **Approval:** PROPOSED
- **Problem:** How caps and funding limits are enforced.
- **Options:** (a) provider caps only; (b) our ledger only; (c) both.
- **Selected:** (c). Our ledger guarantees we never allocate more than confirmed funding. Surplus key budgets and the workspace budget enforce spending at request time.
- **Reasoning:** Two independent controls; Oruno is not in the request path, so the provider must enforce at request time.
- **Trade-offs:** Surplus budgets only have day and month windows, so drops must stay inside one calendar month (or caps must be adjusted at rollover).
- **Consequences:** Acceptance tests must prove both layers; reconciliation compares them daily.

## D-004 — No gateway of our own in V1

- **Date:** 2026-10-30 · **Approval:** PROPOSED
- **Problem:** Whether claimers' requests pass through Oruno.
- **Options:** (a) direct to provider with a personal key; (b) through an Oruno gateway.
- **Selected:** (a).
- **Reasoning:** Simpler, cheaper, no prompts ever touch Oruno; the provider already enforces caps.
- **Trade-offs:** Less control per request; error messages come from the provider.
- **Consequences:** A gateway is reconsidered only if apps need it (future stage), checked against Surplus §8 "competing routing service".

## D-005 — TypeScript and Postgres in one modular monolith

- **Date:** 2026-10-30 · **Approval:** PROPOSED
- **Problem:** Stack for the backend.
- **Options:** TypeScript/Node, Python, Go; Postgres, SQLite.
- **Selected:** TypeScript (strict) on Node.js; Postgres; one deployable with separate modules (identity, drops, claims, ledger, providers, jobs).
- **Reasoning:** One language across backend and the later frontend; mature Postgres transactions for money; simple to run.
- **Trade-offs:** Node needs care with `bigint` for money; monolith must keep module boundaries disciplined.
- **Consequences:** Exact frameworks (HTTP, migrations, test runner) proposed at Phase 1 start.

## D-006 — Name: Oruno

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Product name.
- **Options:** Alvron, Avona, Oruno, Runo, Wayline, Openway, Relay.
- **Selected:** Oruno.
- **Reasoning:** Wayline, Openway and Relay conflict with existing companies; Avona is close to Avon; Oruno had no conflicts in a quick search.
- **Trade-offs:** A formal trademark search hasn't been done.
- **Consequences:** Check trademarks, domains, GitHub org and npm scope before public launch (TASKS).

## D-007 — License: Apache-2.0

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Open-source license.
- **Options:** Apache-2.0, MIT, AGPL.
- **Selected:** Apache-2.0.
- **Reasoning:** Permissive, widely adopted, includes a patent grant.
- **Trade-offs:** Competitors may host the code commercially; the hosted service and operations remain the business.
- **Consequences:** `LICENSE` added.

## D-008 — Claim sign-in: X or GitHub, wallet optional

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** How claimers prove they're real people.
- **Options:** email, X, GitHub, Base wallet.
- **Selected:** X or GitHub, with minimum account age and activity; Base wallet optional as an extra identity.
- **Reasoning:** Account age and activity are hard to fake at scale; matches where drops are shared.
- **Trade-offs:** Excludes people without established accounts.
- **Consequences:** Exact thresholds are OPEN until Phase 2.

## D-009 — Cap per claimer: $5

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Default cap for Drop #1.
- **Options:** $5, $10.
- **Selected:** $5.
- **Reasoning:** Keeps the pilot small and limits farming value.
- **Trade-offs:** Surplus's per-request flat fee ($0.003, applicability to API keys unconfirmed) could take a meaningful share; heavy Claude Code users may exhaust it quickly.
- **Consequences:** Measure fee share and exhaustion speed in the provider spike and Drop #1.

## D-010 — Backend-first development process

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Development process.
- **Options:** build the claim page early; backend first with proof.
- **Selected:** Backend first, phases 0–7 in `PLAN.md`; no frontend before `BACKEND_PROOF.md` is approved.
- **Reasoning:** Oruno moves money and access to paid resources; correctness first.
- **Trade-offs:** Drop #1 launches later than a quick-build approach would.
- **Consequences:** Documentation system per `CLAUDE.md`; status labels OPEN / PROPOSED / APPROVED / VERIFIED.

## D-011 — Funding in USDC on Base

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** How Drop #1 ($100) and the provider spike ($20) are funded.
- **Options:** USDC on Base deposited to Surplus; card credit on Surplus; Bankr credit.
- **Selected:** USDC on Base, deposited to Oruno's Surplus account.
- **Reasoning:** Base-native; on Surplus, deposited USDC is withdrawable, while card credit is not and is refundable only within 24 hours.
- **Trade-offs:** Requires a funded Base wallet and an on-chain deposit; Surplus account must accept the deposit before keys can be issued.
- **Consequences:** A funding record stores the deposit transaction hash; keys are issued only after the deposit is confirmed. Card funding stays out of V1.

## D-012 — V1 scope and architecture approved

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Phase 0 needs an approved V1 scope and architecture before Phase 1.
- **Selected:** V1 scope in `PRODUCT.md` (Drop #1: 20 claims, $5 each, $100, 14 days inside one calendar month, Claude Code, Surplus, claim page after backend proof). Architecture in `ARCHITECTURE.md`, `docs/architecture/DATABASE.md` and `docs/architecture/THREAT_MODEL.md`.
- **Consequences:** D-003 (provider caps plus our ledger), D-004 (no own gateway in V1) and D-005 (TypeScript and Postgres monolith) move from PROPOSED to APPROVED. Exact frameworks are still proposed at Phase 1 start.

## D-013 — Eligibility thresholds for Drop #1

- **Date:** 2026-10-30 · **Approval:** PROPOSED → APPROVED by D-014
- **Problem:** How to tell a real person from a farmed account at sign-in (TH-1).
- **Options:** account age only; age plus activity; manual approval of every claim.
- **Selected (proposed):** age plus activity, checked at sign-in, with manual review for borderline cases.
  - **GitHub:** account created ≥ 180 days ago, and at least one of: ≥ 3 public repositories, or ≥ 20 contributions in the last 12 months.
  - **X:** account created ≥ 180 days ago, ≥ 25 followers, and ≥ 50 posts.
  - Plus: one claim per person per drop; identities linked to a person can't claim twice; claimers must be 18 or older and not in a sanctioned jurisdiction (Surplus Terms §2).
- **Reasoning:** Old, active accounts are expensive to fake at scale. GitHub signals fit developers best.
- **Trade-offs:** Excludes newcomers with new accounts; thresholds may need tuning after Drop #1.
- **Consequences:** Signals stored at sign-in time in `identities`; thresholds held in drop configuration so they can change per drop.

## D-014 — D-013 approved; GitHub-only sign-in for Drop #1

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Confirm eligibility thresholds and which sign-in Drop #1 supports.
- **Options:** X and GitHub (X reads cost about $0.01 each and need a funded X developer account); GitHub only.
- **Selected:** D-013 thresholds approved. Drop #1 uses **GitHub sign-in only**. This narrows D-008 for Drop #1; X sign-in remains the plan for later drops.
- **Reasoning:** GitHub is free and the best signal for developers; avoids a new paid dependency before the pilot.
- **Trade-offs:** People without a GitHub account can't claim in Drop #1; X-only users are excluded until X sign-in is added.
- **Consequences:** Phase 2 builds GitHub OAuth first; X sign-in becomes a later task. Drop #1 thresholds: GitHub account ≥ 180 days old and (≥ 3 public repos or ≥ 20 contributions in the last 12 months); 18+; not in a sanctioned jurisdiction; one claim per person.

## D-015 — Close Phase 0; move the Surplus spike to before Phase 4

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Phase 0 required the $20 Surplus spike before Phase 1, but Phases 1–3 don't touch Surplus.
- **Options:** (a) wait for the spike before any code; (b) start Phase 1 now with a fake provider and run the spike before Phase 4.
- **Selected:** (b). Phase 0 is closed. The provider spike (T-006) and Surplus's written answers (T-004) become entry requirements for Phase 4.
- **Reasoning:** No money or real keys are involved until Phase 4; building the foundation now loses nothing.
- **Trade-offs:** If the spike reveals a Surplus limitation, Phase 4 design may change; Phases 1–3 are provider-independent, so the impact is contained.
- **Consequences:** `PLAN.md` updated; T-003, T-004, T-006 and T-009 carry forward.

## D-016 — Phase 1 stack

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan)
- **Problem:** Exact tools for the backend (refines D-005).
- **Selected:** Node.js 22 · TypeScript (strict) · Fastify (HTTP) · Zod (validation) · Postgres 16 · Kysely (typed SQL, explicit transactions and row locks) with Kysely migrations · pg-boss (Postgres-backed jobs, no Redis) · pino (logging with secret redaction) · Vitest against a real Postgres · pnpm · Biome (lint and format) · GitHub Actions (CI).
- **Options considered:** Hono/Express; TypeBox; Drizzle/Prisma; node-pg-migrate; BullMQ + Redis; Jest; ESLint + Prettier.
- **Reasoning:** Control over SQL and locking for money logic; no extra services; few dependencies; tests on a real database.
- **Trade-offs:** Kysely means writing SQL-shaped queries by hand (more explicit, more code than an ORM).
- **Consequences:** Phase 1 builds on this stack.

## D-017 — Phase 1 closed; Phase 2 design choices

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan approved closing Phase 1 and starting Phase 2); design choices below PROPOSED by Claude within that approval, open to change.
- **Problem:** How Phase 2 implements drops, sign-in and claims before money (Phase 3) and real keys (Phase 4) exist.
- **Selected:**
  - **Claims reserve a slot only.** A Phase 2 claim is `pending` (slot reserved, no key yet). Phase 3 adds funding checks; Phase 4 turns `pending` into `active` by minting a key.
  - **GitHub OAuth with `state` and PKCE (S256).** `state` is single-use and expires after 10 minutes. PKCE is supported by GitHub since July 2025.
  - **Claimer sessions are bearer tokens** returned by the sign-in callback, stored only as SHA-256 hashes, valid 24 hours. Cookie-based sessions are decided with the Phase 6 frontend.
  - **Concurrency:** a claim locks its drop row (`SELECT … FOR UPDATE`) and a unique (drop, person) constraint backs up the one-claim rule.
  - **Age and sanctions:** claimers attest to being 18+ and not in a sanctioned jurisdiction, and accept the terms version, when claiming.
  - **Drop windows must start and end in the same UTC calendar month** (TH-4: provider monthly budget windows).
  - **Rate limits** on sign-in and claim routes using the official `@fastify/rate-limit` plugin (in-memory; single instance in V1).
- **Trade-offs:** In-memory rate limits reset on restart and don't span multiple instances; acceptable for a single-instance V1.
- **Consequences:** Real GitHub sign-in needs a GitHub OAuth App (free) created by Dan before it can be tested live.

## D-018 — Phase 2 closed; credit ledger design

- **Date:** 2026-10-30 · **Approval:** APPROVED (Dan approved closing Phase 2 and starting Phase 3); design below PROPOSED by Claude within that approval.
- **Problem:** Track every micro-dollar and guarantee Oruno never promises more credit than was funded.
- **Selected:**
  - **Double-entry ledger.** Each money movement is a ledger transaction whose entries sum to zero. Entries are append-only. Account balances are maintained by the database from the entries, and **the database refuses any balance below zero** (except the external funding-source account, which records money coming in).
  - **Accounts per drop:** `drop_unallocated` (funded, not yet given to a claim), `claim_allocated` (reserved for one claim), `claim_spent` (used, Phase 4), `drop_returned` (sent back to the funder), and one `funding_source` account.
  - **Funding** is recorded by an operator after a USDC-on-Base deposit is confirmed, with its transaction hash (unique, so a deposit can't be counted twice). On-chain verification of the hash is a later improvement.
  - **A claim allocates its cap** from `drop_unallocated` in the same transaction that creates it, under the drop row lock. Not enough unallocated funds → `409 insufficient_funding`.
  - **Activating or resuming a drop requires** unallocated funds ≥ cap × slots left, so a live drop never shows slots it can't pay for.
  - **Releasing an ended claim's unused allocation** back to the drop is a separate, idempotent step, run by a job after a grace period (1 hour), so Phase 4 can record final usage first.
  - **Returns:** after a drop ends, an operator can record unallocated funds sent back to the funder (with the outgoing transaction hash).
  - **Invariant checker** runs as a job and on demand; any violation is logged as an error.
- **Trade-offs:** Funding confirmation is manual (operator attests) until on-chain verification is built.
- **Consequences:** Existing drops must be funded before activation; tests updated accordingly.
