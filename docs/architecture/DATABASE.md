# Database

**Status: APPROVED** (D-012); implemented through Phase 3 (migrations 0001–0003). Ledger details: `CREDIT_LEDGER.md`. Postgres. Money columns are `bigint` micro-dollars (1 USD = 1,000,000). All timestamps UTC.

## Tables

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `operators` | Oruno team accounts | unique email |
| `people` | A claimer as one person across identities | — |
| `identities` | X / GitHub / wallet accounts linked to a person; account-age and activity signals at sign-in | unique (provider, provider_user_id) |
| `funders` | Who funds drops (Oruno only in V1) | — |
| `drops` | Rules: cap, max claims, models, starts_at, ends_at, status; provider workspace id | cap > 0; ends_at > starts_at; status in allowed set |
| `fundings` | Confirmed deposits backing a drop: amount, method (`usdc_base`), tx hash, confirmed_by, confirmed_at | amount > 0; unique lowercase 0x hash; append-only |
| `claims` | One person's claim on a drop: status, cap, provider key id, expires_at | **unique (drop_id, person_id)**; status in allowed set |
| `fund_returns` | Unallocated funds sent back to the funder | amount > 0; unique tx hash; append-only |
| `ledger_accounts` | `funding_source`, `drop_unallocated`, `drop_returned`, `claim_allocated`, `claim_spent` | balance ≥ 0 except funding_source; balance maintained by trigger; unique (kind, drop, claim) |
| `ledger_transactions` | One money movement | unique idempotency key; ≥ 2 entries summing to zero (checked at commit); append-only |
| `ledger_entries` | Signed amounts per account | amount ≠ 0; append-only |
| `usage_snapshots` | Per-claim usage pulled from the provider: spent, requests, active days | unique (claim_id, snapshot_date) |
| `outcomes` | What claimers chose to share (link, short text) | — |
| `abuse_flags` | Signals and actions on identities or claims | — |
| `audit_events` | Every operator and security action | append-only |
| `idempotency_keys` | Outbound provider calls and inbound requests | unique key |

## Claim states

`pending` → `active` → `exhausted` | `expired` | `revoked`; `pending` → `failed` (provider error, reservation released).

## Drop states

`draft` → `active` ⇄ `paused` → `ended`.

## Invariants (tested, see `TESTING.md`)

- Per drop: Σ claim caps (pending + active + exhausted + expired) ≤ Σ confirmed fundings.
- Per ledger transaction: entries sum to zero.
- No account balance below zero.
- At most one claim per person per drop.

## Never stored

Key secrets, prompts, model outputs, OAuth access tokens beyond what sign-in requires.
