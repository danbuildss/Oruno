# Threat model

**Status: APPROVED** as the initial model (D-012). Reviewed again before launch (BP-15). Every high-severity threat needs a tested mitigation before launch (BP-15).

## Assets

Funders' money · provider admin key · claimers' personal keys · claimer identity data · Oruno's reputation and Surplus account standing.

## Threats

| # | Threat | Severity | Mitigation | Test |
| --- | --- | --- | --- | --- |
| TH-1 | Farming: one person claims many times with fake or bought accounts | High | X/GitHub sign-in with account age and activity thresholds; one claim per person across linked identities; claim rate limits; small caps | Partly VERIFIED (Phase 2): eligibility, one claim per person, rate limits |
| TH-2 | Key sharing or resale by a claimer | Medium | Personal keys only; usage anomaly flags; revocation; claimer terms | Manual review in pilot |
| TH-3 | Overspend: total spend exceeds funding | High | Ledger invariant (Σ caps ≤ funding) + provider key caps + workspace budget = funding | Ledger part VERIFIED (Phase 3): claims refused beyond funding under concurrency, DB refuses overdrafts; provider part via AT-3/4/8 in Phase 4 |
| TH-4 | Cap doubling across a month boundary (monthly budget window) | Medium | Drops inside one calendar month, or adjust caps at rollover | AT, month-boundary check |
| TH-5 | Concurrent claims allocate the same funds | High | Reservation in one database transaction with row locking; unique constraints | VERIFIED: slots (Phase 2) and funds (Phase 3) |
| TH-6 | Duplicate key minting on retry | Medium | Idempotency keys on every provider write | VERIFIED with fake (Phase 4a): crash recovery and 5 concurrent attempts → one key |
| TH-7 | Admin key leak | Critical | Secret store only; never in repo or logs; least access; rotation procedure | Log and repo scan |
| TH-8 | Key secret leak from Oruno | High | Never stored; shown once over HTTPS to the signed-in claimer | VERIFIED with fake (Phase 4a): secret absent from all tables and logs; AT-13 in Phase 4b |
| TH-9 | Prompt or output exposure | High | Oruno not in the request path; provider body capture off; nothing stored | AT-14, BP-13 |
| TH-10 | OAuth callback forgery or replay | High | State parameter, PKCE, short-lived sessions | VERIFIED (Phase 2): forged, expired, replayed state and PKCE mismatch refused |
| TH-11 | Operator account takeover | High | Strong auth, limited operators, audit log | Security |
| TH-12 | Provider supply changes or poor model quality | Medium | `trusted_only` routing; acceptance tests per model; fallback provider plan | AT-9 |
| TH-13 | Terms breach with Surplus §8 (branding, claimer terms, misrepresenting caps) | High | Claimer terms (T-009); wording review; never imply a model provider affiliation | Review before launch |
| TH-14 | Abuse of models by claimers (illegal or harmful use) | Medium | Claimer terms; revocation; Oruno responsible under §8(b) | Runbook |
| TH-16 | Rotation used to reset a key's cap | High | Successor capped at remaining amount; max 3 rotations | VERIFIED with fake (Phase 4a); AT-16 in Phase 4b |
| TH-17 | Provider overshoot beyond cap | Medium | Ledger never records past the cap; overshoot stored and flagged; workspace ceiling | VERIFIED with fake (Phase 4a); AT-4, AT-18 in Phase 4b |
| TH-15 | Provider outage during a drop | Low | Status communication; extend drop if needed | Runbook |

## Review — 2026-11-02 (Phase 5)

| # | Severity | Mitigation status |
| --- | --- | --- |
| TH-1 Farming | High | VERIFIED: eligibility thresholds, one claim per person (app + DB), rate limits |
| TH-3 Overspend | High | VERIFIED in the ledger (DB refuses overdrafts; claims beyond funding refused under concurrency); provider caps with fake; real Surplus AT-3/4/8 in 4b |
| TH-5 Concurrent allocation | High | VERIFIED (slots and funds) |
| TH-7 Admin key leak | Critical | Partly: never in repo or logs (redaction tested). Secret storage, rotation and access control are Phase 7 operations |
| TH-8 Key secret leak | High | VERIFIED with fake: never stored; absent from every table and log |
| TH-9 Prompt exposure | High | By design: Oruno isn't in the request path; nothing stores prompts. Provider body capture to confirm off in 4b |
| TH-10 OAuth forgery/replay | High | VERIFIED |
| TH-11 Operator takeover | High | Partly: hashed keys, audit log, disable. MFA/IP limits for operators are Phase 7 |
| TH-13 Surplus §8 terms | High | Open: claimer terms drafted; legal and wording review before launch |
| TH-16 Rotation resets cap | High | VERIFIED with fake; AT-16 in 4b |
| TH-18 Dropped DB connection crashes the server | High | **Found in Phase 5 and fixed**; VERIFIED (killed connections → retryable 503, recovery, no crash) |
| TH-19 Hung queries or locks block the service | Medium | VERIFIED: 5 s lock timeout, 15 s statement timeout → retryable 503 |
| TH-20 Orphaned provider keys after a crash | Medium | VERIFIED with fake: reconciliation job revokes unknown Oruno keys, spares in-flight issuance and non-Oruno keys |

## Review — 2026-11-02 (Phase 6, claim website)

| Threat | Severity | Status |
| --- | --- | --- |
| TH-21 Session token stolen by page script (XSS) | High | Mitigated: HttpOnly cookie; strict CSP (`script-src 'self'`, no inline, no third parties); React escapes output. VERIFIED: e2e shows `document.cookie` has no token and no CSP violations |
| TH-22 Cross-site request forgery on claim, rotate, revoke, sign-out | High | Mitigated: `X-Requested-With: oruno` required for cookie POSTs; SameSite=Lax. VERIFIED (integration tests) |
| TH-23 Key secret left in the browser | High | Mitigated: shown from memory only; never stored or put in the URL; `no-store` on API responses. VERIFIED (e2e) |
| TH-24 Open redirect after sign-in | Medium | Mitigated: redirect targets built from a validated slug only. VERIFIED (tampered return cookie test) |
| TH-25 Clickjacking | Medium | Mitigated: `frame-ancestors 'none'`, `X-Frame-Options: DENY`. VERIFIED (header tests) |

## Review — 2026-11-02 (Phase 7 preparation)

| Threat | Severity | Status |
| --- | --- | --- |
| TH-26 Rate limits bypassed with a forged `X-Forwarded-For`, or all users sharing one limit behind Vercel | Medium | Mitigated: `TRUST_PROXY` off by default (forged header ignored, VERIFIED); with N trusted hops each client is limited separately and a prepended fake address is ignored (VERIFIED). Correct hop count behind Vercel **UNVERIFIED** until staging |
| TH-27 Secrets in the container image or host logs | High | Mitigated: `.dockerignore` excludes `.env*`; secrets only via host secret store; operator key creation in an interactive shell only (DEPLOYMENT.md) |
| TH-28 Website deployed pointing at the wrong API | Medium | Mitigated: placeholder API origin uses `.invalid` (fails closed); header values tested against the server's |

## Out of scope for V1

Card payment fraud (no card payments), smart contract risks (no contracts), multi-tenant isolation between funders (single funder).
