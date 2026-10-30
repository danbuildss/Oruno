# Backend proof

The frontend (Phase 6) starts only when every item below is **VERIFIED** with reproducible evidence and Dan approves.

Evidence format: command run, result summary, commit hash, date.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| BP-1 | Service starts from a clean checkout with documented commands; health check passes | VERIFIED | 2026-10-30, `4734e4b`: `pnpm install`, `pnpm build`, `pnpm migrate`, `node dist/main.js` → `GET /health` 200; graceful SIGTERM shutdown. See `TESTING.md` results log |
| BP-2 | Migrations apply and roll back on a clean database | VERIFIED | 2026-10-30, `4734e4b`: `tests/integration/migrations.test.ts` (6 tests) and manual `pnpm migrate` / `pnpm migrate down` round trip |
| BP-3 | Operator can create, activate, pause and end a drop through the API | OPEN | — |
| BP-4 | Claimer sign-in via GitHub works; ineligible accounts rejected (D-014 thresholds) | OPEN | — |
| BP-5 | One claim per person per drop, including under concurrent attempts | OPEN | — |
| BP-6 | Claims never exceed the drop's slots or confirmed funding under concurrency | OPEN | — |
| BP-7 | Financial invariants hold across the full test suite | OPEN | — |
| BP-8 | Claim issues a real Surplus key with the correct cap, expiry and scope; secret shown once and never stored | OPEN | — |
| BP-9 | Provider failures (timeout, error, duplicate request) never create duplicate keys or lose reservations | OPEN | — |
| BP-10 | Revocation (operator and self) stops the key at the provider | OPEN | — |
| BP-11 | Usage sync and reconciliation match Surplus within $0.01 | OPEN | — |
| BP-12 | Worker crash and application restart recover without data loss | OPEN | — |
| BP-13 | No secrets, prompts or outputs in logs or database (scan) | OPEN | — |
| BP-14 | Provider acceptance tests AT-1 to AT-15 pass | OPEN | — |
| BP-15 | Threat model reviewed; every high-severity threat has a tested mitigation | OPEN | — |

**Approval:** OPEN.
