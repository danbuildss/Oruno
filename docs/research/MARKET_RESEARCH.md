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

### Decision (APPROVED, D-014)

**GitHub sign-in only for Drop #1** (free, best signal for developers). X sign-in is added later, once an X developer account is funded (about $0.01 per check). Thresholds approved in D-013/D-014.

## Name check: "Oruno" (T-012)

Checked 2026-10-30.

| Check | Result | Status |
| --- | --- | --- |
| Web search for companies, apps, brands or trademarks named "Oruno" | None found. Nearby names: Orano (nuclear company; ORANO trademarks in India), Orune (town in Sardinia) | Searched |
| npm package `oruno` | Not published (registry returns 404) | VERIFIED available today |
| npm scope `@oruno` | No packages found | Searched |
| Domains (oruno.com, .ai, .dev, .xyz) | Could not check: blocked from this session | OPEN — Dan to check at a registrar |
| GitHub organisation `oruno` | Could not check: blocked from this session | OPEN — Dan to check |
| Formal trademark search (USPTO; Nigeria's trademark registry; classes 9 and 42) | Not done | OPEN — before public launch |

Sources: [search: trademark results](https://www.indiafilings.com/search/orano-tm-1476951), [Orune](https://en.wikipedia.org/wiki/Orune), [app trademark classes](https://www.trademarkengine.com/blog/how-to-trademark-an-app-name/).

Recommendation: register the domain and the npm package name early; they cost little and the name looks clear so far.

## Future directions from research (PROPOSED, not planned)

Recorded 2026-11-02 (D-020). None of these is built or scheduled; each needs its own decision after Drop #1.

| Idea | Why | Main risk | Earliest |
| --- | --- | --- | --- |
| **Crowdfunded drops** — anyone can top up a drop's funding goal in USDC | "Strangers fund strangers" energy (the viral "bored billionaires pay my bills" idea, applied to AI access) using existing drops and ledger | Funding attribution and refunds to many funders | With "anyone can fund a drop" |
| **Requests** — a person posts a need, funders choose to fund it | Strong viral loop | Scams, fake stories, begging dynamics; harder anti-abuse | After crowdfunded drops |
| **"Request more" when credit runs out** | Gentle first version of requests | Spam | After Drop #1 |
| **Chat page for non-developers** — "sponsor funds it, user just chats" | Much larger audience than developers | Oruno would carry prompts (privacy, hosting, moderation; check Surplus §8 "competing routing") | After Drop #1, with its own privacy review |
| **Low-credit notifications** | Cheap, useful | — | Phase 6 backlog |
| **Recurring funding** (monthly top-ups) | Organisations and grant programmes | — | With organisations |
| **Second legitimate provider before organisations fund drops** | Oruno is only as clean as its supply; Surplus sellers may resell credits (lab terms; Surplus §5.2 puts provider terms on us) | Integration effort (small, via the adapter) | Before organisation funding |
| **Partner with Surplus** rather than compete | Oruno is a Surplus customer and distribution channel; Surplus could add "sponsored keys" itself | Dependence | Any time |

**Rejected (repeatedly suggested by research):** a supply marketplace where people list their unused ChatGPT/Claude subscriptions or API keys, and an Oruno-run router. Reasons: lab terms and ban risk; duplicates Surplus; may breach Surplus §8 "competing routing service". Revenue comes from visible drop/programme fees, not price spreads. Impact is reported as active users, requests, spend and shared outcomes — never "hours of AI".

Positioning line (PROPOSED): **"Fund AI access for anyone. Set a cap, share a link, and people use it in their own tools — no subscription, no card. Built on Base."**
