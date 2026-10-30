# Credit ledger

**Status: VERIFIED for Phase 3** (commit `2f6d4db`). How Oruno accounts for every micro-dollar, and why it can't promise more credit than was funded.

## Money units

All amounts are integer **micro-dollars** (`bigint`; 1 USD = 1,000,000). The API sends them as strings. Floating point is never used.

## Accounts

| Account | One per | Meaning |
| --- | --- | --- |
| `funding_source` | system | Money that came in from outside. It is the only account allowed to go negative: its balance is minus everything ever funded |
| `drop_unallocated` | drop | Funded, not yet reserved for anyone |
| `claim_allocated` | claim | Reserved for one claim (its cap, until spent or released) |
| `claim_spent` | claim | Used by the claimer (recorded from provider usage in Phase 4) |
| `drop_returned` | drop | Sent back to the funder |

## Money movements

| Transaction | Entries | When |
| --- | --- | --- |
| `funding` | source −X, drop_unallocated +X | Operator records a confirmed USDC-on-Base deposit (`POST /v1/drops/:id/fundings`) |
| `claim_allocation` | drop_unallocated −cap, claim_allocated +cap | Inside the claim transaction, under the drop row lock |
| `claim_release` | claim_allocated −rest, drop_unallocated +rest | After a claim ends (revoked, expired, failed, exhausted), once the 1-hour grace period has passed |
| `spend` | claim_allocated −x, claim_spent +x | Phase 4, from provider usage |
| `return` | drop_unallocated −X, drop_returned +X | Operator records funds sent back after the drop ended |

Each transaction carries an **idempotency key** (`funding:<id>`, `claim_allocation:<claim>`, `claim_release:<claim>`, `return:<id>`), so retries never move money twice.

## Rules the database enforces

These hold even if the application has a bug:

1. **Balanced:** every transaction has at least two entries, summing to zero. This is checked when the transaction commits.
2. **Append-only:** ledger entries, ledger transactions, fundings and returns can't be updated or deleted.
3. **No overdrafts:** balances are maintained by a trigger from the entries, and a check refuses any balance below zero (except `funding_source`).
4. **A deposit counts once:** the funding transaction hash is unique, and so is the return hash.

## Rules the application enforces

- **A claim needs funding:** if `drop_unallocated` < cap, the claim is refused (`insufficient_funding`). The drop row lock makes concurrent claims take turns, so two claims can't spend the same dollars.
- **A live drop must be able to pay for its open slots:** activating or resuming requires `drop_unallocated` ≥ cap × slots left.
- **Funding:** only drops that haven't ended can be funded. **Returns:** only after the drop ends, and never more than is unallocated.
- **Releases are delayed and idempotent:** a release requires a terminal claim. The scheduled job waits one hour after the claim ends, so Phase 4 can record final usage first. Concurrent releases move the money once.

## Invariants

The invariant checker recomputes everything from scratch. It runs hourly (`ledger.check`) and on demand (`GET /v1/ledger/check`):

| Check | Meaning |
| --- | --- |
| `account_balance_matches_entries` | Stored balance = sum of its entries |
| `transaction_balanced` | Every transaction sums to zero with ≥ 2 entries |
| `non_negative_balance` | No account except `funding_source` below zero |
| `drop_funds_conserved` | Per drop: total funded = unallocated + allocated + spent + returned |
| `returns_match_records` | Per drop: `drop_returned` = sum of return records |
| `funding_source_matches_fundings` | Source balance = −(total funded) |
| `claim_within_cap` | Per claim: allocated + spent ≤ cap |
| `open_claim_fully_backed` | Every pending or active claim holds exactly its cap (allocated + spent) |

Any violation is logged as an error by the job.

## Jobs

| Job | Schedule | What it does |
| --- | --- | --- |
| `drops.expire` | every minute | Ends finished drops; expires their open claims |
| `claims.release` | every 5 minutes | Releases ended claims older than 1 hour |
| `ledger.check` | hourly (minute 17) | Runs the invariant checker |

## Known limits

- Funding is **operator-attested**: the operator confirms the USDC transfer on Base and records the hash. Automatic on-chain verification is a later improvement.
- If usage is reported after a claim's allocation has been released (Phase 4), the spend can't come from `claim_allocated`, and the database will refuse it. Phase 4 must handle this case explicitly.
