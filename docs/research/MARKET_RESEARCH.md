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

## Sign-in signals for eligibility (T-008)

Researched 2026-10-30. The official doc sites (docs.github.com, docs.x.com) were blocked from the research session, so the findings below come from search results that quote those docs. **Confirm against the live docs at Phase 2 start.**

### GitHub

| Signal | Where | Notes |
| --- | --- | --- |
| Account creation date | REST `GET /user` → `created_at` | Public profile data; available with a basic OAuth sign-in |
| Public repositories | `GET /user` → `public_repos` | |
| Followers / following | `GET /user` → `followers`, `following` | |
| Contributions in the last year | GraphQL `user.contributionsCollection.contributionCalendar.totalContributions` | Private contributions only counted with the `read:user` scope |

- **Cost:** free. GitHub OAuth apps and these API reads have no per-call charge.
- **Assessment:** strong signal for developers; cheap to check.
- Sources: [GitHub REST users (Enterprise Server 3.6 sample response)](https://docs.github.com/en/enterprise-server@3.6/rest/users/users), [scope behaviour (3.4)](https://docs.github.com/en/enterprise-server@3.4/rest/users/users), [contributionsCollection example](https://mkz.me/til/git/retrieve-github-contributions-with-graphql/), [contributions gist](https://gist.github.com/geekygirldawn/ef3bd920d1360ad1eed28bd647764f07).

### X

| Signal | Where | Notes |
| --- | --- | --- |
| Account creation date | `GET /2/users/me?user.fields=created_at` | Requires OAuth 2.0 user context |
| Followers, following, posts, lists | `user.fields=public_metrics` → `followers_count`, `following_count`, `tweet_count`, `listed_count` | Fields must be requested explicitly |
| Verified | `user.fields=verified` | |

- **Cost:** X API is pay-per-use since February 2026, with no self-serve free tier per several sources. The official pricing page lists **User: Read at $0.010 per resource**; a cheaper "owned read" rate ($0.001) applies only to the app owner's own account. So each X sign-in check costs about **$0.01** and needs a funded X developer account.
- **Assessment:** useful because drops are shared on X, but it adds a paid dependency. For 500 sign-in attempts, about $5.
- Sources: [X fields](https://docs.x.com/enterprise-api/fundamentals/fields), [X data dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary/reference.md), [X user object](https://developer.x.com/en/docs/x-api/data-dictionary/object-model/user), [X pricing](https://docs.x.com/x-api/getting-started/pricing.md), [pricing overview (third party)](https://postproxy.dev/blog/x-api-pricing-2026/).

### Recommendation (PROPOSED, T-013)

Support **GitHub sign-in for Drop #1** (free, best signal for developers). Add X sign-in when an X developer account is funded, since it costs about $0.01 per check. Thresholds are proposed in D-013.
