# Market research

As of 2026-10-30. Facts link to sources; assessments are labelled.

## Demand signals (existing behaviour, not Oruno validation)

- Organisations already fund AI access for developers by hand: OpenAI's Codex Open Source Fund (up to $25K in API credits) and Ona (up to $200/month for open-source contributors). Sources: [Codex fund](https://codex.danielvaughan.com/2026/03/31/codex-open-source-fund), [Ona](https://ona.com/stories/ona-for-open-source).
- Hack Club runs free capped AI for its members: [ai.hackclub.com](https://ai.hackclub.com).
- A grey market for discounted AI credits exists, showing price sensitivity: [report](https://theagenttimes.com/articles/token-brokers-build-multimillion-dollar-grey-market-for-unus-5589c285).

**Assessment:** Demand from claimers (free AI) is very likely. Demand from funders other than Oruno is unproven and is the key question after Drop #1.

## Supply: Surplus market snapshot (Claude models)

Pulled from `GET https://api.surplusintelligence.ai/api/markets` on 2026-10-30.

| Model | Median discount | Healthy sellers | Requests 24h | Uptime |
| --- | --- | --- | --- | --- |
| claude-opus-5.5 | 27% | 46 | 32,188 | 85% |
| claude-sonnet-5.5 | 23% | 37 | 21,847 | 86% |
| claude-haiku-5.5 | 34% | 22 | 28,264 | 70% |
| claude-sonnet-5 | 36% | 87 | 15,548 | 90% |
| claude-opus-4.8 | 29% | 56 | 4,466 | 99% |

Best-offer discounts reach 85–99% but the median is the realistic figure.

## Provider controls compared

| Provider | Keys by API | Per-key cap | Expiry | Notes | Source |
| --- | --- | --- | --- | --- | --- |
| Surplus | Yes (admin key) | Yes (day/month windows) | Yes | Nested workspace budgets; Base-native | [llms.txt](https://www.surplusintelligence.ai/llms.txt) |
| OpenRouter | Yes (management key) | Yes (USD limit, optional reset) | — | Fallback candidate | [docs](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys.md) |
| Anthropic | No (Console only) | Per workspace, set by hand | — | Not suitable for drops | [workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces), [admin keys](https://platform.claude.com/docs/en/manage-claude/admin-api-keys) |
| Bankr | Unknown | Unknown | Unknown | Major Surplus customer ([page](https://bankr.bot/agents/surplus-intelligence)) | T-005 |

## Funders to approach after Drop #1 (assessment)

Base ecosystem projects and grants, Bankr and its community, DAOs with grant programmes (including Optimism RetroPGF across the Superchain), developer communities (including African developer communities), dev-tool companies, accelerators, universities.

## Pending research

- T-008: X and GitHub OAuth signals for account age and activity, and their costs.
