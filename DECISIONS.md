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
