# Acceptance tests

Run against a real Surplus key funded with about $20 before any real person gets a key. A failure in AT-3, AT-4, AT-8 or AT-12 blocks launch until explained or fixed.

| # | Test | Pass condition |
| --- | --- | --- |
| AT-1 | Mint a key via the admin API with a $5 cap, expiry and model scope | Key works; settings read back correctly |
| AT-2 | Call a model outside the scope | Rejected clearly |
| AT-3 | Spend a key to its cap with ordinary requests | Total billed ≤ cap |
| AT-4 | 10 parallel streamed requests with $0.50 left | Overshoot within Surplus's stated tolerance (target $0) |
| AT-5 | Revoke a key mid-session | Next request rejected within 60 seconds |
| AT-6 | Key reaches its expiry | Rejected after expiry |
| AT-7 | Raise a key's cap by $5 | New cap applies; total spend ≤ new cap |
| AT-8 | Mint keys whose caps exceed the workspace budget, then spend | Spend never exceeds the workspace budget |
| AT-9 | 30-minute real Claude Code task per candidate model | Completes with tool use and streaming |
| AT-10 | Cap runs out inside Claude Code | Error recorded; onboarding text explains it |
| AT-11 | Cut a streamed response off mid-way | Charged once; nothing stuck |
| AT-12 | Compare our usage records with Surplus account spend after AT-1 to AT-11 | Difference ≤ $0.01 |
| AT-13 | Show a key secret twice | Second view impossible |
| AT-14 | Inspect our storage and reports | No prompt or output text anywhere |
| AT-15 | Rotate a key | Old key rejected; usage continues under the same claim |

Also record: the per-request fee actually charged, and how a monthly cap behaves across a month boundary.

Results go in `NOTES.md` with the date and the key id used.
