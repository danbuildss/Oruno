# NOTES — Project memory

**Read this before any task.** Update it after every meaningful session. History lives in `docs/project/SESSION_LOG.md`; don't delete context, move it there.

_Last updated: 2026-10-30_

## 1. Current project status

V1 scope and architecture approved (D-012). Phase 0 research continuing. No product code. No money spent. Nothing deployed.

## 2. Current development phase

**Phase 0 — Research and Architecture** (IN PROGRESS). See `PLAN.md`.

## 3. Last completed task

T-012 — name check (no conflicts found; npm `oruno` available). D-013 thresholds and GitHub-only sign-in approved (D-014).

## 4. Current implementation state

No code. Repository contains documentation and the Apache-2.0 license only. Branch: `docs/foundation` (pushed to GitHub).

## 5. What is working

Nothing implemented yet.

## 6. What is broken

Nothing implemented yet.

## 7. Known limitations (from research, not yet tested)

- Surplus budgets have day and month windows only; no lifetime window found. A monthly cap can double if a drop crosses a month boundary.
- Surplus charges a per-request flat fee ($0.003 per `/x402/info`); unconfirmed whether it applies to API-key traffic. Could take a large share of a $5 cap.
- On Surplus's Anthropic endpoint, "out of credit" appears as a generic `400 invalid_request_error`. Claimers need clear onboarding text.
- Surplus verifies seller reachability and health, not model quality (weights, quantization, injected prompts).

## 8. Outstanding bugs

None (no code).

## 9. Important architectural decisions

See `DECISIONS.md`. Summary:
- APPROVED: D-001 credit drops first · D-002 Surplus Pattern A · D-006 name Oruno · D-007 Apache-2.0 · D-008 X/GitHub sign-in, wallet optional · D-009 $5 cap · D-010 backend-first process · D-011 funding in USDC on Base.
- APPROVED (via D-012): D-003 provider caps + our ledger · D-004 no own gateway in V1 · D-005 TypeScript + Postgres monolith · V1 scope.
- APPROVED: D-013 eligibility thresholds · D-014 GitHub-only sign-in for Drop #1.

## 10. Pending approvals

| Item | Where | Notes |
| --- | --- | --- |
| Claimer terms draft | T-009, `docs/legal/CLAIMER_TERMS.md` | Then a lawyer review |
| Spending: $20 test key | T-006 | Deferred by Dan ("5 later") |

## 11. Next recommended task

1. Dan: review claimer terms (T-009); send Surplus questions (T-004). Domain and name registration deferred to public launch (T-012). Bankr checked: not shareable (T-005).
2. When Dan is ready: Surplus org + admin key (T-003), $20 USDC deposit, then the provider spike (T-006).
3. Phase 0 exit review, then approval to start Phase 1.

Claude's own Phase 0 research tasks are complete. Remaining Phase 0 items need Dan or spending approval.

## 12. Relevant commits

- `5f96e34` Initial commit
- `ed7936e` First foundation docs (superseded by `c3b2a76`)
- `c3b2a76` Documentation system and Apache-2.0 license
- `4d32768` Funding decision D-011
- `c2ca114` V1 scope and architecture approval; sign-in research; draft claimer terms

## 13. Important testing results

None yet.

## 14. Deployment status

Nothing deployed. No environments exist.

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
- Who does the one-hour legal review of claimer terms (T-009).
