# Product

## In one sentence

Fund AI credit, set a cap per person, share a link, and people use it in their own AI tools for free, until their cap runs out.

## Who it's for

| Role | Who | What they want |
| --- | --- | --- |
| **Funder** | Individuals with spare credit, creators, companies, DAOs, Base projects, schools, hackathons | Give AI access easily and safely, with a cap, and see the impact |
| **Claimer** | Developers and learners, especially those who can't afford subscriptions | Free, simple access in tools they already use |
| **App developer** *(Phase 4)* | People building AI apps | Let users spend sponsor-funded AI without building billing |
| **Agent** *(Phase 6)* | AI agents and automations | A safe, capped budget |
| **Operator** | The Oruno team | Run the system, handle abuse, reconcile money |

## The core loop

1. **Fund.** The funder adds credit (USDC on Base first; card later).
2. **Create a drop.** Total amount, cap per person, number of claims, eligibility rules, allowed models, end date.
3. **Share.** One link, posted on X, Telegram, Discord or anywhere.
4. **Claim.** A person signs in (X, GitHub, or wallet), passes anti-abuse checks, and receives a personal capped key, shown once.
5. **Use.** They paste three settings into Claude Code (or another supported tool) and build.
6. **Stop.** At the cap or the end date the key stops working. Spend can never exceed funding.
7. **See the impact.** The funder sees claims, usage and outcomes people choose to share. Never prompts.

## Screens

| Screen | Phase | Purpose |
| --- | --- | --- |
| Claim page | 1 | Sign in, check eligibility, get key, copy setup steps |
| "My key" page | 1 | Remaining balance, setup steps, revoke my key |
| Admin stats | 1 | Operator view of claims, usage, abuse flags |
| Create-a-drop page | 2 | Funder sets amount, caps, rules, dates; funds it |
| Funder dashboard | 2 | Claims, usage, outcomes, remaining funds, revoke |
| Organisation settings | 3 | Teams, branding, eligibility lists, reports |
| Developer portal | 4 | API keys, docs, SDK |

## Supported tools

- **Phase 1:** Claude Code (via Surplus's Anthropic-compatible endpoint).
- **Later:** Cursor, OpenCode and any tool that accepts a custom base URL.

## What we are not building

A model, a chatbot, a Claude Code competitor, a token, NFTs, a marketplace for trading credit, a custodial wallet, or resale of subscription credits whose terms forbid it.

## Glossary

| Term | Meaning |
| --- | --- |
| **Drop** | A funded campaign: total amount, cap per person, rules, dates, one share link |
| **Funder** | Whoever puts credit into a drop |
| **Claim** | One person's successful request to join a drop |
| **Claimer** | A person who claimed |
| **Key** | The personal, capped provider key a claimer uses in their tool |
| **Cap** | The most one key can ever spend |
| **Ledger** | Our record of every cent funded, reserved, spent and returned |
| **Provider** | Where AI inference comes from (Surplus first) |
| **Outcome** | What a claimer built, shared voluntarily (a link, a sentence) |
