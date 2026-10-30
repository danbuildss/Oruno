# Backend proof

The frontend (Phase 6) starts only when every item below is **VERIFIED** with reproducible evidence and Dan approves.

Evidence format: command run, result summary, commit hash, date.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| BP-1 | Service starts from a clean checkout with documented commands; health check passes | VERIFIED | 2026-10-30, `4734e4b`: `pnpm install`, `pnpm build`, `pnpm migrate`, `node dist/main.js` → `GET /health` 200; graceful SIGTERM shutdown. See `TESTING.md` results log |
| BP-2 | Migrations apply and roll back on a clean database | VERIFIED | 2026-10-30, `4734e4b`: `tests/integration/migrations.test.ts` (6 tests) and manual `pnpm migrate` / `pnpm migrate down` round trip |
| BP-3 | Operator can create, activate, pause and end a drop through the API | VERIFIED | 2026-10-30, `33466ef`: `tests/integration/drops-api.test.ts`; manual smoke test |
| BP-4 | Claimer sign-in via GitHub works; ineligible accounts rejected (D-014 thresholds) | PARTIAL | 2026-10-30, `33466ef`: full flow verified with a fake GitHub that enforces PKCE (`sign-in.test.ts`); real client unit-tested; eligibility tested. **Live GitHub sign-in not yet tested** (needs a GitHub OAuth App) |
| BP-5 | One claim per person per drop, including under concurrent attempts | VERIFIED | 2026-10-30, `33466ef`: one person ×10 concurrent → 1; database unique constraint test (`claims.test.ts`) |
| BP-6 | Claims never exceed the drop's slots or confirmed funding under concurrency | VERIFIED | Slots: `33466ef`, 100 people on 20 slots → 20. Funding: `2f6d4db`, 100 claims on a drop funded for 10 → 10, unallocated never below 0 (`ledger.test.ts`) |
| BP-7 | Financial invariants hold across the full test suite | VERIFIED | `2f6d4db`: 3×250 randomized ledger operations; `1edef71`: 200 randomized steps including provider spend, overshoot, rotation and releases — invariants checked after every step |
| BP-8 | Claim issues a real Surplus key with the correct cap, expiry and scope; secret shown once and never stored | PARTIAL | Fake provider VERIFIED `1edef71` (cap, expiry, scope; secret absent from DB and logs). **Real Surplus: Phase 4b** |
| BP-9 | Provider failures (timeout, error, duplicate request) never create duplicate keys or lose reservations | PARTIAL | Fake provider VERIFIED `1edef71` (retries, permanent failure releases funds, crash recovery reuses key, concurrent attempts → one key). Real Surplus: Phase 4b |
| BP-10 | Revocation (operator and self) stops the key at the provider | PARTIAL | Fake provider VERIFIED `1edef71` (incl. retry after provider error). Real Surplus: AT-5 in Phase 4b |
| BP-11 | Usage sync and reconciliation match Surplus within $0.01 | PARTIAL | Fake provider VERIFIED `1edef71` (spend sync exact, idempotent, concurrent-safe). Real Surplus: AT-12, AT-17 in Phase 4b |
| BP-12 | Worker crash and application restart recover without data loss | OPEN | — |
| BP-13 | No secrets, prompts or outputs in logs or database (scan) | PARTIAL | Key secret scanned across every table and the logs `1edef71`; operator key, session token, OAuth code/state scans in earlier phases. Re-run on real Surplus in Phase 4b |
| BP-14 | Provider acceptance tests AT-1 to AT-15 pass | OPEN | — |
| BP-15 | Threat model reviewed; every high-severity threat has a tested mitigation | OPEN | — |

**Approval:** OPEN.
