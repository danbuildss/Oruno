# Roadmap

Each phase ends with a gate. We move on only when the gate is passed. Time estimates are rough.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Foundation | **In progress** |
| 1 | Drop #1 | Not started |
| 2 | Anyone can fund a drop | Not started |
| 3 | Organisations | Not started |
| 4 | Infrastructure for apps | Not started |
| 5 | Onchain programmable funding | Not started |
| 6 | Open network and agents | Not started |

## Phase 0 — Foundation (1–2 weeks, no product code)

- Write the plan into this repo.
- Create a Surplus organisation and admin key.
- Ask Surplus the open questions in `NOTES.md`.
- Check whether Bankr credit can be split into capped keys.
- Run `docs/ACCEPTANCE_TESTS.md` on a $20 test key.

**Gate:** caps and expiry proven safe; at least one Claude-class model works well in Claude Code.

## Phase 1 — Drop #1 (2–3 weeks)

**Build**
- Claim page: sign in with X or GitHub, eligibility checks, one claim per person.
- Key minting on Surplus with cap, expiry and model scope.
- "My key" page with setup steps and remaining balance.
- Admin stats and revoke.
- Daily usage sync.

**Run:** we fund about $100–200 at $5–10 per person for 20–40 people, posted on X. Details in `docs/DROP_1.md`.

**Gate:** at least 60% of claimers use their key; abuse under control; at least 3 people or organisations ask to fund their own drop.

## Phase 2 — Anyone can fund a drop (4–6 weeks)

**Build**
- Create-a-drop page for funders.
- Funding in USDC on Base (deposited, withdrawable).
- Funder dashboard: claims, usage, outcomes, remaining funds, revoke.
- Approval mode for claims.
- Double-entry ledger and daily reconciliation.
- Outcome collection (what claimers built).

**Run:** 5–10 drops funded by others (friends, creators, Base projects, Bankr community).

**Gate:** at least 2 funders run a second drop.

## Phase 3 — Organisations (1–2 months)

**Build**
- Organisation accounts and teams.
- Branded drop pages.
- Eligibility rules: GitHub org, allowlist, email domain.
- Value reports for funders' stakeholders.
- Webhooks.
- First paid plan and drop fee.

**Target:** DAOs, Base ecosystem grants, hackathons, bootcamps, developer communities, universities.

**Gate:** first paying organisations; revenue covers running costs.

## Phase 4 — Infrastructure for apps (2–3 months)

**Build**
- Public API and TypeScript SDK.
- "Use sponsored AI" sign-in for third-party apps.
- Second provider (Bankr or OpenRouter).
- Open-source release of the core, with docs.

**Gate:** at least 3 independent apps live on the API.

## Phase 5 — Onchain programmable funding (after Phase 3–4 traction)

**Build**
- Funding pool contract on Base: deposit, rules, refunds.
- Public transparency page per drop.
- Direct funding by DAOs and treasuries.
- Bankr and Base ecosystem integrations.

**Gate:** legal review complete; pools handle real treasury money safely.

## Phase 6 — Open network and agents (long term)

- Portable access standard: one grant works across apps and providers.
- Agent spending permissions: safe, capped AI budgets for agents.
- Community AI pools: groups fund shared AI for their members.
