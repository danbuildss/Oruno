# NOTES — Project memory

**Read this before any task.** Update it after every meaningful session. History lives in `docs/project/SESSION_LOG.md`; don't delete context, move it there.

_Last updated: 2026-10-30_

## 1. Current project status

Phases 0–1 closed. Phase 2 (Drop and Claim Engine) built and tested; awaiting Dan's exit approval. No money spent. Nothing deployed.

## 2. Current development phase

**Phase 2 — Drop and Claim Engine** (IN REVIEW, exit approval pending). See `PLAN.md`.

## 3. Last completed task

Phase 2 build: T-201 to T-207 VERIFIED (commit `33466ef`); T-208 docs in review. Live GitHub sign-in (T-209) needs a GitHub OAuth App.

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

Claims stay `pending` (no keys yet). No ledger or provider code yet (Phases 3–4). API reference: `docs/architecture/API.md`; design: `docs/architecture/DROP_ENGINE.md`.

## 5. What is working

Verified on commit `4734e4b` (36/36 tests, lint, typecheck, build; manual start-up check). See `TESTING.md`:
config validation; migrations up/down; append-only audit log; health check; operator key auth; secret redaction in logs; error responses; background jobs.

Verified on commit `33466ef` (108/108 tests): drops and state machine; GitHub sign-in flow (fake GitHub with PKCE); eligibility; claims with concurrency safety; revocation; expiry job; rate limits.

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
| **Phase 2 exit → start Phase 3 (Credit Ledger and Funding)** | `PLAN.md`, T-208 | BP-3, BP-5 VERIFIED; BP-4, BP-6 partial (live GitHub; funding) |
| GitHub OAuth App | T-209 | Free; needed to test live sign-in |
| Claimer terms draft | T-009, `docs/legal/CLAIMER_TERMS.md` | Then a lawyer review |
| Spending: $20 test key | T-006 | Deferred by Dan ("5 later") |

## 11. Next recommended task

1. Dan: review Phase 2; approve the exit and Phase 3 (Credit Ledger and Funding) start.
2. Dan: create a GitHub OAuth App (T-209) so live sign-in can be tested.
3. PR #3 (Phase 1) CI passed — ready to merge. Then open the Phase 2 pull request.
3. Carried forward for Phase 4: Surplus answers (T-004, Dan asked), admin key (T-003), $20 spike (T-006), claimer terms legal review (T-009).

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

## 13. Important testing results

2026-10-30, `4734e4b`: 36/36 tests pass on real Postgres 16; lint, typecheck and build clean; manual start-up, health, auth, graceful shutdown and migration round trip all as expected.

2026-10-30, `33466ef`: 108/108 tests; 100 concurrent claims on 20 slots → exactly 20; one person ×10 → 1; replayed, expired and forged sign-in state refused; PKCE mismatch refused. Full log in `TESTING.md`.

## 14. Deployment status

Nothing deployed. No environments exist. Local development only (Postgres on the dev machine).

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
- Cookie vs bearer session for the Phase 6 claim page (D-017 uses bearer tokens for now).
- Rate limits are in-memory (single instance); revisit if Oruno runs more than one instance.
- Who does the one-hour legal review of claimer terms (T-009).
