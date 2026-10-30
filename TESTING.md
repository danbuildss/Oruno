# Testing

Strategy, required cases, commands and results. Nothing is VERIFIED without a recorded result.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm test` | All tests (unit + integration on real Postgres at `TEST_DATABASE_URL`; the test database is wiped) |
| `pnpm lint` | Biome lint and format check (recommended rules) |
| `pnpm typecheck` | TypeScript strict check of sources and tests |
| `pnpm build` | Compile to `dist/` |
| `pnpm migrate` / `pnpm migrate down` | Apply / roll back migrations on `DATABASE_URL` (rollback refused in production) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, build and tests against Postgres 16 on every pull request and push to `main`.

## Test categories and required cases

### Unit
- Drop rule validation (cap > 0, total ≥ cap, dates valid, models non-empty).
- Claim state machine: only allowed transitions.
- Money helpers: integer micro-dollar arithmetic, no floats, rounding rules.

### Integration (real Postgres)
- Create drop → claim → key issued (fake provider) → usage sync → reconcile.
- Provider failure during claim releases the reservation.

### Database
- Migrations apply and roll back.
- Constraints: unique claim per (drop, person); non-negative amounts; foreign keys.

### API
- Validation errors return structured responses.
- Auth required on operator routes; claimer routes require a valid session.

### Financial invariants
- Σ allocated caps ≤ confirmed funding, per drop, always.
- Ledger entries sum to zero per transaction.
- No balance goes negative.
- Reconciliation flags any difference > $0.01 between ledger and provider usage.

### Security
- Key secrets never stored or logged (scan logs and database after test runs).
- No prompt or output text stored anywhere.
- Replayed or forged OAuth callbacks rejected.
- Ineligible accounts (too new, inactive) rejected.
- Operator routes unreachable without operator auth.

### Concurrency
- 100 simultaneous claims on a drop with 20 slots → exactly 20 succeed.
- Same person claiming twice at once → one succeeds.
- Concurrent claims never allocate more than funding.

### Failure recovery
- Provider timeout or error during key minting; retry with the same idempotency key creates at most one key.
- Worker crash mid-sync; restart resumes safely.
- Database transaction failure leaves no partial claim.
- Application restart during claim.

### End-to-end (Phase 6)
- Sign in → claim → see key once → "my key" page shows balance.

### Load (Phase 7)
- Claim burst when the drop is posted (e.g. 500 attempts in one minute).

## Provider acceptance tests (Surplus spike, T-006)

Run against a real Surplus key funded with about $20, **only after spending approval**. A failure in AT-3, AT-4, AT-8 or AT-12 blocks launch.

| # | Test | Pass condition | Result |
| --- | --- | --- | --- |
| AT-1 | Mint a key via admin API with $5 cap, expiry, model scope | Key works; settings read back | OPEN |
| AT-2 | Call a model outside the scope | Rejected | OPEN |
| AT-3 | Spend a key to its cap | Total billed ≤ cap | OPEN |
| AT-4 | 10 parallel streamed requests with $0.50 left | Overshoot within Surplus's stated tolerance (target $0) | OPEN |
| AT-5 | Revoke a key mid-session | Next request rejected within 60 s | OPEN |
| AT-6 | Key reaches expiry | Rejected after expiry | OPEN |
| AT-7 | Raise a cap by $5 | New cap applies; spend ≤ new cap | OPEN |
| AT-8 | Key caps exceed the workspace budget; spend | Spend never exceeds workspace budget | OPEN |
| AT-9 | 30-minute real Claude Code task per candidate model | Completes with tool use and streaming | OPEN |
| AT-10 | Cap runs out inside Claude Code | Error message recorded for onboarding text | OPEN |
| AT-11 | Cut a stream mid-response | Charged once; nothing stuck | OPEN |
| AT-12 | Our records vs Surplus account spend after AT-1 to AT-11 | Difference ≤ $0.01 | OPEN |
| AT-13 | Retrieve a key secret a second time | Impossible | OPEN |
| AT-14 | Inspect our storage and reports | No prompt or output text | OPEN |
| AT-15 | Rotate a key | Old key rejected; new key works under the same claim | OPEN |

Also record: the per-request fee actually charged, and cap behaviour across a month boundary.

## Results log

### 2026-10-30 — Phase 1, commit `4734e4b`

Environment: local Postgres 16.15, Node 22.22.0, pnpm 10.28.0.

- `pnpm lint` — clean (34 files). Lint rules confirmed active by a deliberate bad file (noDebugger, noDoubleEquals, noExplicitAny fired).
- `pnpm typecheck` — clean.
- `pnpm build` — clean.
- `pnpm test` — **36 passed, 0 failed** (8 files):

| Area | Tests |
| --- | --- |
| Config (unit) | defaults; explicit values and PORT coercion; missing DATABASE_URL; non-postgres URL; invalid PORT and NODE_ENV listed; DATABASE_URL value never in error message |
| Operator keys (unit) | format; hash deterministic and not the key; 1,000 keys all unique; malformed keys rejected |
| Logger (unit) | 10 secret values across authorization headers, cookie, x-api-key, apiKey, databaseUrl, secret, password, token, key all redacted |
| Migrations (integration) | apply on clean DB; idempotent; full rollback; re-apply; audit log refuses UPDATE and DELETE; constraints reject empty name, non-hex hash, unknown actor type |
| Health (integration) | 200 ok with database; 503 degraded when database unreachable |
| Operator auth (integration) | valid key 200; missing header, wrong scheme, key without scheme, malformed key, unknown key all 401; key absent from operators and audit tables; key absent from logs; creation audited; disabled key 401 and disabling audited; empty name refused |
| Errors (integration) | structured 404; validation 400 with field paths; malformed JSON 400; AppError passthrough; internal error message hidden |
| Jobs (integration) | pg-boss job queued and processed exactly once on real Postgres |

Manual start-up check (BP-1, BP-2) on `oruno_dev`, from the built app:
- `pnpm migrate` → `Up 0001_operators_and_audit: Success`; again → `Nothing to do.`
- `pnpm operator:create "Dan"` → operator created; key printed once.
- `node dist/main.js` (NODE_ENV=production) → `GET /health` 200 `{"status":"ok","database":"ok"}`; `GET /v1/operator/me` 200 with key, 401 without.
- Server log contains the key 0 times.
- SIGTERM → "shutting down" logged; process exited.
- `pnpm migrate down` → `Down 0001_operators_and_audit: Success`; `pnpm migrate` → `Up … Success`.
- `NODE_ENV=production pnpm migrate down` → refused, exit 1.
- Missing DATABASE_URL → clear config error, exit 1.

Not yet verified: CI on GitHub (runs when the branch's pull request opens).
