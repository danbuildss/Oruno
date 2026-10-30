# Notes

The running log for Oruno. Every working session adds an entry at the top of the log: what was done, what was decided, what was learned, and what comes next. Open questions and open decisions are kept current below.

## Current state

- **Phase:** 0 — Foundation (planning, no product code)
- **Next milestone:** Surplus organisation + admin key set up; acceptance tests run on a $20 test key
- **Branch with these docs:** `docs/foundation` (not pushed yet)

## Open decisions

| Decision | Options | Leaning | Owner |
| --- | --- | --- | --- |
| Final brand name | Oruno (working), others | Keep Oruno until Drop #1 | Dan |
| Open-source license | Apache-2.0, MIT, AGPL | Apache-2.0 for the core | Dan |
| Sign-in for Drop #1 | X, GitHub, Base wallet | X + GitHub; wallet optional | Dan + Claude |
| Default cap for Drop #1 | $5 or $10 per person | $5, or $10 if Surplus's per-request fee applies to API keys | Dan |
| Use Bankr credit | Split on Bankr vs move to Surplus | Depends on Bankr's key controls | Dan |

## Open questions

**For Surplus (ask in writing):**

- [ ] Is there a lifetime (all-time) budget window, or only day and month?
- [ ] Does the $0.003 per-request flat fee apply to API-key traffic, or only x402?
- [ ] Which sellers serve Claude models, and is that supply legitimately sourced under the model providers' terms?
- [ ] Would a future Oruno gateway that routes across several providers, with Surplus as one, count as a "directly competing routing service" (§8)?

**For Bankr:**

- [ ] Can Bankr credit be split into extra API keys with spending limits for other people?
- [ ] Is Bankr open to a partnership (sponsored drops for its community)?

**For us:**

- [ ] What minimum account age and activity counts as "real" for X and GitHub sign-in?
- [ ] Who are the first 3 outside funders to approach after Drop #1?
- [ ] Which lawyer gives the one-hour review before paid or onchain funding?

## Log

### 2026-10-30 — Foundation docs written

**Done**
- Researched the idea end to end: competitors, Surplus docs and terms, Anthropic and OpenRouter key controls, market data.
- Pivoted from "corporate sponsorship pilot" to **credit drops**: anyone funds AI credit, sets a cap per person, posts a link, people claim and use it free.
- Wrote this repo's documentation set (vision, product, architecture, providers, safety, business model, roadmap, Drop #1, acceptance tests, research, decisions).

**Decided** (see `docs/decisions/`)
- First product is credit drops shared by link (0001).
- Surplus Intelligence Pattern A is the first provider (0002).
- Phase 1 relies on Surplus's native caps and expiry; our own ledger arrives in Phase 2 (0003).
- USDC on Base, deposited, is the primary funding method (0004).
- TypeScript + Postgres modular monolith (0005).
- Oruno is a working name (0006).

**Learned**
- Surplus already supports per-key hard caps, expiry, model scopes, nested budgets, per-key usage, and no prompt storage. Its terms (§8) allow reselling with conditions.
- Surplus budgets have day and month windows only (no lifetime window found).
- Claude models on Surplus: median discounts 17–50%, uptime 62–99%.
- Anthropic can't create capped keys by API; OpenRouter can.
- Nobody found offering "anyone funds a capped AI drop by link" as a product. Closest: Hack Club AI (closed community), OpenRouter/Surplus (tools only), Puter (user pays).

**Next**
1. Dan reviews these docs.
2. Dan creates a Surplus organisation and admin key; checks Bankr key controls.
3. Send the Surplus questions.
4. Run acceptance tests on a $20 key.
