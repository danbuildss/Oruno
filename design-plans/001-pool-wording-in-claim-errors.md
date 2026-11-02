# 001 — Say "pool", not "drop", in errors a claimer can see

- **Status:** PROPOSED (awaiting Dan's approval)
- **Written against commit:** 97683d5
- **Finding:** Error messages shown on the pool page say "drop", against the approved rule that people see "pool".

## Why
`DECISIONS.md` D-022 (APPROVED): "Everything people see says **pool** … Internal code, database tables and current API paths keep the name `drops`."

The claim form shows the server's error message as-is: `web/src/pages/Pool.tsx` sets `setError(err.message)` and renders it in `<p className="error">`. Messages from the claim request (`POST /v1/drops/:slug/claims`) therefore reach the claimer. Two stay on screen after the page refreshes (terms outdated, funding left); the others show briefly before the page switches to its pool-state notice.

## Change
Edit the **message text only** (third `AppError` argument / map values). Keep every error **code** unchanged.

`src/claims/claims.ts`:
| Line | Old | New |
| --- | --- | --- |
| 38 | `This drop isn't open for claims.` | `This pool isn't open for claims.` |
| 39 | `This drop hasn't started yet.` | `This pool hasn't opened yet.` |
| 40 | `This drop has ended.` | `This pool has ended.` |
| 41 | `All slots in this drop have been claimed.` | `All the credit in this pool has been claimed.` |
| 72 | `Please accept the current terms for this drop.` | `Please accept the current terms for this pool.` |
| 89 | `You've already claimed from this drop.` | `You've already claimed from this pool.` |
| 116 | `This account doesn't meet the drop's requirements.` | `This account doesn't meet this pool's requirements.` |

`src/ledger/ledger.ts`:
| Line | Old | New |
| --- | --- | --- |
| 229 | `This drop doesn't have enough funding left.` | `This pool doesn't have enough credit left.` |

## Do not change
- Error codes (`drop_full`, `drop_ended`, …): API contract and D-022 keep code names.
- Operator-only messages (`src/drops/drops.ts`, funding/return messages in `src/ledger/ledger.ts` other than line 229, `src/http/routes/drops.ts`): operators use engineering terms.
- `Drop not found.` messages: the pool page shows its own "Pool not found" notice for a 404 and never displays this text.

## Affected surfaces
Pool page (`/p/:slug`) claim form error line, in every claim error state.

## Verify
- `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` — all pass (no test asserts the old wording; checked at 97683d5).
- `grep -n "drop" src/claims/claims.ts | grep '"[A-Z]'` shows no claimer-facing message containing "drop".

## Docs to update
`docs/architecture/API.md`: the example error body (`"All slots in this drop have been claimed."`) → `"All the credit in this pool has been claimed."`.
