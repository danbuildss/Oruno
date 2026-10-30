# Tasks

States: **BACKLOG · READY · IN PROGRESS · BLOCKED · IN REVIEW · VERIFIED**. Every task has a completion condition.

## Phase 0 — Research and Architecture

| ID | Task | State | Completion condition | Owner |
| --- | --- | --- | --- | --- |
| T-001 | Establish the documentation system | IN REVIEW | Files per `CLAUDE.md` exist and are populated without invented claims; Dan reviews | Claude |
| T-002 | Confirm the funding method for Drop #1 | VERIFIED | Dan confirmed USDC on Base (D-011) | Dan |
| T-003 | Create a Surplus organisation and an admin key | BACKLOG | Org and workspace exist; admin key stored in a secret store, not the repo | Dan (Claude guides) |
| T-004 | Ask Surplus the four open questions in writing | READY | Written answers recorded in `docs/architecture/PROVIDERS.md` | Dan |
| T-005 | Check whether Bankr credit can be split into capped keys | READY | Answer recorded in `docs/architecture/PROVIDERS.md` | Dan |
| T-006 | Provider spike: run AT-1 to AT-15 on a $20 Surplus key | BLOCKED (needs T-003 and spending approval) | Results with evidence in `TESTING.md` | Claude |
| T-007 | Decide eligibility thresholds (account age, activity) for X and GitHub | VERIFIED (approved, D-014) | Thresholds approved and recorded in `DECISIONS.md` | Claude proposes, Dan approves |
| T-008 | Check X and GitHub OAuth: which account-age and activity signals are available, at what cost | VERIFIED (findings accepted; field names to be confirmed against live docs in Phase 2) | Findings with sources in `docs/research/MARKET_RESEARCH.md` | Claude |
| T-009 | Draft claimer terms meeting Surplus §8 conditions | IN REVIEW (draft in `docs/legal/CLAIMER_TERMS.md`) | Draft reviewed by Dan; legal review scheduled | Claude drafts |
| T-010 | Approve V1 scope (`PRODUCT.md` → V1 boundaries) | VERIFIED | Approved by Dan (D-012) | Dan |
| T-011 | Approve architecture (`ARCHITECTURE.md`, DATABASE, THREAT_MODEL) | VERIFIED | Approved by Dan (D-012) | Dan |
| T-013 | Decide whether Drop #1 supports X sign-in (paid X API reads) or GitHub only | VERIFIED (GitHub only, D-014) | Dan decides; recorded in `DECISIONS.md` | Dan |
| T-012 | Trademark, domain, GitHub org and npm scope check for "Oruno" | IN REVIEW (domains, GitHub org and formal trademark search left for Dan) | Results recorded; any conflicts flagged | Claude researches |

## Later phases

Tasks for Phases 1–7 are created when each phase is approved to start. See `PLAN.md`.
