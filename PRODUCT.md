# Product

Approved product direction for Oruno. Changes require Dan's approval and an entry in `DECISIONS.md`.

## Definition — APPROVED

Oruno lets anyone fund AI credit for other people. A funder sets a total amount and a cap per person, shares one link, and people sign in to claim a personal capped key that works in their own AI tools. Claimers never pay. When a cap or end date is reached, access stops.

## Positioning — APPROVED

**Intelligence should move freely.**

## Mission — APPROVED

Make access to AI programmable, shareable and fundable by anyone, starting with developers who can't afford subscriptions.

## Core problem

- Whoever uses AI has to pay for it (subscriptions around $20/month, a card, an account). Many people who want to learn or vibe code can't afford it.
- People and organisations who would pay for others (individuals with spare credit, creators, communities, companies, DAOs, schools) have no simple, safe way to do it. Today they share keys in chats, which leak, or give up.

## Target users

| Role | Who | Need |
| --- | --- | --- |
| Funder | Individuals with spare credit, creators, communities, companies, DAOs, Base projects, schools | Give AI access safely, with a cap, and see the impact |
| Claimer | Developers and learners, especially those who can't afford subscriptions | Free, simple access in tools they already use |
| Operator | Oruno team | Run drops, handle abuse, reconcile money |
| App developer *(future)* | Builders of AI apps | Let users spend sponsor-funded AI without building billing |
| Agent *(future)* | AI agents | A safe, capped budget |

## Core loop — APPROVED

1. **Fund** — the funder adds credit.
2. **Create a drop** — total, cap per person, number of claims, eligibility, models, end date.
3. **Share** — one link, posted anywhere (X first).
4. **Claim** — sign in, pass eligibility and anti-abuse checks, receive a personal capped key (shown once).
5. **Use** — paste the key into Claude Code and build.
6. **Stop** — at the cap or end date the key stops. Spend can never exceed funding.
7. **See impact** — the funder sees claims, usage and voluntarily shared outcomes. Never prompts.

## Principles — APPROVED

1. Free for the claimer.
2. Caps are sacred: no one spends more than their share; a funder is never charged more than they put in.
3. Private by default: funders see usage, never content.
4. Provider-neutral: start on Surplus; never depend on one supplier forever.
5. Open: Apache-2.0 core.
6. Base-native funding, without requiring claimers to own a wallet.
7. Real usage before big architecture.

## V1 boundaries

**V1 = Drop #1: one self-funded drop, run by the Oruno operator.**

| Area | V1 | Status |
| --- | --- | --- |
| Funder | Oruno only (Dan) | APPROVED |
| Cap per claimer | $5 | APPROVED |
| Claim sign-in | X or GitHub (wallet optional) | APPROVED |
| Provider | Surplus Intelligence, Pattern A (one provisioned key per claimer) | APPROVED |
| Tool | Claude Code | APPROVED |
| Number of claims | 20 | APPROVED |
| Total funding | $100 (+ $20 test key) | APPROVED |
| Funding method | USDC on Base, deposited to the Surplus account | APPROVED |
| Duration | 14 days, inside one calendar month | APPROVED |
| Eligibility thresholds (account age, activity) | Proposed in D-013 | PROPOSED |
| Frontend | Claim page and "my key" page only, after backend proof | APPROVED |

**Not in V1:** drops created by other funders, funder dashboard, organisation accounts, payments by card, public API or SDK, multiple providers, onchain contracts.

## Explicit exclusions

A model, a chatbot, a Claude Code competitor, a token, NFTs, a marketplace for trading credit, a custodial wallet, cash-out of credit, and redistribution of subscription credits whose terms forbid it.

## Long-term direction — PROPOSED

Each stage requires proof from the previous one; none is promised.

1. Credit drops (V1).
2. Anyone can fund a drop (funder pages, USDC funding, ledger).
3. Organisations (branded drops, eligibility lists, reports, paid plans).
4. Infrastructure for apps (public API, SDK, second provider, open-source release).
5. Onchain programmable funding on Base (funding pools, transparency).
6. Open network and agents (portable grants, agent budgets, community pools).

## Business model — PROPOSED

Free during V1. Later: drop fees, organisation plans, API usage pricing, a limited supply margin (never the core model), enterprise contracts. Claimers never pay.

## Open product decisions

See `NOTES.md` → Pending approvals.
