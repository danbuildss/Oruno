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
| AT-16 | Rotate a part-spent key, then spend | Total across both keys ≤ original cap | OPEN |
| AT-17 | Read `GET /v1/budgets/spend` for a key with known spend | Shape matches the client; amount correct | OPEN |
| AT-18 | Workspace ceiling below key caps | Spend stops at the ceiling | OPEN |

Also record: the per-request fee actually charged, and cap behaviour across a month boundary.

## Results log

### 2026-10-30 — Phase 4a (fake provider), commit `1edef71`

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: clean.
- `pnpm test`: **158 passed, 0 failed** (17 files). Key and ledger suites re-run twice more: 37/37 each time.

| Area | Tests |
| --- | --- |
| Fake provider (unit) | capped, expiring, model-scoped key, idempotent; hard stop at cap and deliberate overshoot; rotation retires old key and caps new; failure injection |
| Surplus client (unit, simulated HTTP; **unverified against the real API**) | key mint body (scope, `trusted_only`, hard-stop monthly budget, expiry) with admin auth and idempotency header; rotate then cap successor; revoke treats 404 as done; 5xx/429 retryable, 400/403 not; admin key never in error messages; HTTP 200 with error body is a failure; spend parsing; workspace ceiling body |
| Key issuance | claim → active with a working key; scope and expiry enforced; **secret absent from every database table and the logs**; 503 with no provider (no claim created) |
| Outages and recovery | 2 provider failures → claim pending (202), retry job activates it, claimer fetches the key (first fetch isn't a rotation); permanent failure → claim failed, funds released, slot freed, **person can claim again**; gives up after 5 retryable failures; **crash after provider created the key → retry reuses it (one key)**; **5 simultaneous issuance attempts → one key, one activation** |
| Rotation | old secret stops working, new works; **new key capped at what's left ($3 of $5); spending past it stops; claim exhausted at $5 total**; limit of 3 replacements (4th → 429); another person can't rotate it |
| Revocation | reaches the provider; a failed provider revocation is completed by the job; idempotent; keys of claims expired at drop end revoked |
| Spend | provider spend recorded in the ledger; **5 concurrent syncs record once**; idempotent; claimer sees spent and remaining; exhausted at cap, key revoked, nothing to release; **overshoot capped in the ledger, recorded and flagged**; final usage recorded before release; usage reported after release flagged, never taken from other funds |
| Ceiling | provider ceiling follows funding ($100) and returns ($60 after a $40 return) |
| **Randomized** | 200 random steps (claims with injected failures, spend incl. overshoot, sync, rotation, revocation, release, retries, funding); **ledger invariants checked after every step** |
| Earlier suites | all passing (claim responses now include the key) |

Manual smoke test: `PROVIDER=fake` with `NODE_ENV=production` refused at startup; with development: migration 0004 applied, funding 201, schedules `claims.release, drops.expire, keys.issue_pending, keys.revoke_ended, ledger.check, spend.ceiling, spend.sync` present, FAKE warning logged, operator key in log 0 times.

Found and fixed during testing: after a permanent issuance failure the database allowed a new claim but the application's own duplicate check still counted the failed claim; it now ignores failed claims.

Not verified: anything against the real Surplus API (Phase 4b).

### 2026-10-30 — Phase 3, commit `2f6d4db`

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: clean.
- `pnpm test`: **127 passed, 0 failed** (15 files). Ledger and claims suites re-run twice more: 35/35 each time.

| Area | Tests |
| --- | --- |
| Database rules | **unbalanced transaction refused at commit**; transaction with < 2 entries refused; **overdraft refused** (`ledger_accounts_non_negative`); ledger entries, transactions and fundings refuse UPDATE/DELETE; same idempotency key posts once |
| Funding | API records deposit and shows balances; duplicate tx hash 409; decimal, numeric, short and uppercase inputs 400; operator key required; ended drop refuses funding |
| Activation | unfunded/partly funded drop refused with required vs available amounts; opens once fully funded; resume needs only open slots |
| Allocation | claim moves cap from drop to claim; **100 concurrent claims on a drop funded for 10 (20 slots) → exactly 10; unallocated ends at 0, never below**; invariants clean |
| Release | open claim refused; revoked claim released once even with **5 concurrent releases** (one ledger transaction); job waits the 1-hour grace (59 min: nothing; 60 min: released; 61 min: nothing more); claims expired at drop end are released |
| Returns | refused before the drop ends; can't exceed unallocated; returns all unallocated by default; duplicate hash 409; nothing left → 409 |
| Invariant checker | healthy ledger → no violations (also via API); **a balance tampered with directly in SQL is detected** (`account_balance_matches_entries`, `drop_funds_conserved`) |
| **Randomized** | 250 random steps (claim, fund, revoke, release, transitions, returns, time passing, expiry) for each of 3 seeds; **all invariants checked after every step**; asserts the run exercised claims, funding, revocations and releases |
| Earlier suites | all passing; drops are now funded before activation in test helpers |

Manual smoke test (built server, `oruno_dev`): activate unfunded → 409 with required $100 vs $0; fund $100 → 201 with balances; activate → 200; balances correct; `/v1/ledger/check` → ok; schedules `claims.release`, `drops.expire`, `ledger.check` present; graceful shutdown.

Found and fixed during testing: recording a return with an already-used hash after the funds were gone reported `insufficient_funding` instead of `duplicate_reference`; duplicates are now checked first.

### 2026-10-30 — Phase 2, commit `33466ef`

- `pnpm lint`, `pnpm typecheck`, `pnpm build`: clean.
- `pnpm test`: **108 passed, 0 failed** (14 files). Concurrency and sign-in files re-run 3 times: 27/27 each time.

| Area | Tests |
| --- | --- |
| Drop rules (unit) | valid drop parsed, money → bigint; 13 invalid inputs rejected (decimal/number/zero/negative/over-$1,000 money, bad slug, 0 claims, no models, blank name, date without timezone, end before start, crossing a month); month boundary exact at midnight allowed, +1 ms refused; drop and claim state machines; claimability (active, paused, before start, at end, full) |
| Eligibility (unit) | repos path; contributions path; exactly 180 days accepted; 179 refused; 2 repos + 19 contributions refused; unknown contributions = 0; multiple reasons |
| GitHub client (unit) | authorize URL has state + S256 challenge and no scopes; code exchange sends verifier and secret; GitHub error surfaced; profile + contributions parsed with bearer token; contributions failure → null; bad `/user` shape rejected; **RFC 7636 PKCE test vector** |
| Sign-in (integration) | full flow stores signals and returns a working session; session token, code and state absent from logs and database; replayed state refused; expired state (10 min + 1 ms) refused; forged state refused without calling GitHub; **PKCE mismatch fails sign-in**; repeat sign-in links to same person; **two simultaneous first sign-ins → one person**; session expires after 24 h; sign-out; blocked person refused; 503 when GitHub not configured; 21st sign-in attempt in a minute → 429 |
| Drop API (integration) | create (money as string), operator key required, invalid input 400, duplicate slug 409; full state machine with audit trail; no activation after window; public view hides drafts and internal ids; **database refuses a drop crossing a month** |
| Claims (integration) | eligible claim → pending, slot used, audited, second claim refused; sign-in required; each missing attestation 400; outdated terms 409; too-new and inactive accounts 403 with reasons; draft / not started / ended refused; **100 people on 20 slots → exactly 20**; **one person ×10 concurrently → exactly 1**; **database refuses a duplicate claim**; 11th claim request in a minute → 429; self-revoke own claim only, twice refused, slot kept, can't re-claim; operator revoke with reason, audited; expiry job ends drop, expires open claims only, idempotent |
| Phase 1 suites | unchanged, all passing (migrations now cover both migrations) |

Manual smoke test on the built server (`oruno_dev`): migration 0002 applied; `/v1/auth/github/start` → 503 `github_not_configured`; create drop 201; activate 200; public view 200; claim without sign-in 401; operator key in log 0 times; `drops.expire` schedule present (1 row); graceful shutdown.

Not verified: real GitHub sign-in (needs a GitHub OAuth App); CI on GitHub for this branch (runs when its pull request opens).

CI on GitHub for Phase 1 (PR #3): **passed** — https://github.com/danbuildss/Oruno/actions/runs/41118580629

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
