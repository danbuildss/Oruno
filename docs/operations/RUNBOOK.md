# Runbook

**Status: DRAFT (Phase 5).** Written from tested behaviour with the fake provider. Completed in Phase 7 with deployment, monitoring and real Surplus details.

## Start, stop, upgrade

| Task | How | Notes |
| --- | --- | --- |
| Apply migrations | `pnpm migrate` | The server **refuses to start** while migrations are pending and names them |
| Start | `node dist/main.js` (after `pnpm build`) | Needs `DATABASE_URL`; `PROVIDER` is `none`, `fake` (not in production) or `surplus` |
| Stop | `SIGTERM` | Graceful: finishes in-flight requests, stops jobs, closes the database |
| Crash or `kill -9` | Just start again | Verified: health ok, ledger clean, schedules intact; jobs are idempotent and retried |
| Create an operator | `pnpm operator:create "<name>"` | Key shown once; store it in a password manager |

## Health and checks

- `GET /health` → `200 {status:"ok"}`, or `503 {status:"degraded"}` if the database is unreachable.
- `GET /v1/ledger/check` (operator) → `{ok, violations[]}`. Also runs hourly; a violation is logged as `LEDGER INVARIANT VIOLATION`.

## Scheduled jobs

| Job | Every | If it fails |
| --- | --- | --- |
| `drops.expire` | 1 min | Retried with backoff (5 attempts); safe to re-run |
| `claims.release` | 5 min | Syncs spend, then releases ended claims older than 1 h |
| `ledger.check` | hourly | Logs violations; investigate immediately (below) |
| `keys.issue_pending` | 1 min | Retries pending key issuance; claims fail after 5 attempts (funds and slot freed) |
| `keys.revoke_ended` | 1 min | Revokes provider keys of ended claims |
| `keys.reconcile` | 15 min | Revokes Oruno keys at the provider that the database doesn't know |
| `spend.sync` | 5 min | Records provider spend |
| `spend.ceiling` | hourly | Sets the provider ceiling to funds held |

## Incidents

| Symptom | Meaning | Action |
| --- | --- | --- |
| API returns `503 busy` / `timeout` | Lock or statement timeout (5 s / 15 s) | Usually transient; clients retry. If sustained, look for long transactions in `pg_stat_activity` |
| API returns `503 database_unavailable`; `/health` degraded | Database unreachable or connections dropped | The pool reconnects by itself once the database is back; no restart needed (verified) |
| `LEDGER INVARIANT VIOLATION` in logs | Stored money records don't add up | **Pause all drops** (`POST /v1/drops/:id/pause`), keep the logs, run `/v1/ledger/check`, investigate before resuming. Never edit ledger rows (the database refuses) |
| `claim.overshoot` audit event | Provider spend went past a claim's cap | Oruno absorbs it. Check the provider; consider revoking the claim; record in `NOTES.md` |
| Many `key issuance failed` warnings | Provider down or refusing | Claims stay pending and retry; after 5 failures they fail and free their slot. Pause the drop if the provider is down for long |
| A key is shared or abused | — | `POST /v1/claims/:id/revoke` with a reason; the key is revoked at the provider within a minute |
| Operator key leaked | — | Create a new operator; disable the old one (`disableOperator`); audit log shows its actions |
| Provider admin key leaked | — | Revoke it at the provider immediately, issue a new one, update `SURPLUS_ADMIN_KEY`, restart (Phase 4b detail) |

## Never

- Edit or delete ledger, funding or audit rows (the database refuses anyway).
- Run `pnpm migrate down` in production (refused).
- Run with `PROVIDER=fake` in production (refused).
