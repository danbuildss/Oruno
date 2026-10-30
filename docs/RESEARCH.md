# Research

What we learned before building. As of 2026-10-30.

## Is anyone doing this?

No product found where **anyone funds AI credit, sets a cap per person, and shares a claim link** that strangers use in their own AI tools. Close neighbours:

| Who | What they do | Why it's different |
| --- | --- | --- |
| Hack Club AI | Free AI for Hack Club teens, capped about $4/day | Closed community, single funder |
| OpenRouter, Surplus | API keys with spending limits | Tools for developers, no drops or claim flow |
| Puter | Apps where each user pays for their own AI | User pays, not a sponsor |
| Pollinations | Free or cheap AI API with limited free use | One provider giving its own capacity |
| OpenAI / Anthropic subscriber credits | Pro, Max, Team plans include API credits | Tied to one account; not shareable |
| Credit brokers | Resell unused AI credits at a discount | Grey market, often against provider terms |
| x402 agent wallets | Agents pay per request in USDC | Self-pay, not sponsorship |
| Grant programmes (Codex Open Source Fund, Ona) | Credits for selected developers | Manual, for their own product only |

**Why it's still open:** farming from public links, provider terms on sharing credit, and no obvious business model for giving things away. Whoever solves abuse and legitimate supply cleanly first has an edge.

**Biggest copy risk:** OpenRouter (already has capped keys) or Bankr (already runs a gateway on Surplus) adding "share credit" as a feature.

## Key technical findings

- **Surplus** supports everything Drop #1 needs. See `docs/PROVIDERS.md`.
- **Anthropic** spend limits are per workspace and set in the Console; API keys can't be created by API.
- **OpenRouter** creates keys by API with USD limits; good fallback.
- **LiteLLM** has keys, budgets and teams; useful reference if we ever run our own gateway.

## Reviewer feedback that shaped the plan

1. Sell or prove usage before building; keep the first build thin.
2. Report value (what people built), not just spend.
3. Know the fallback if Surplus changes terms or prices.
4. Self-fund the first cohort to create proof; recruit from developer communities, including African ones.
5. Onchain is right for funding and transparency, not for per-request spend limits.
6. Base and Bankr ecosystem projects, DAOs, grants programmes, dev-tool companies and universities are natural funders.

## Sources

- [Surplus llms.txt](https://www.surplusintelligence.ai/llms.txt)
- [Surplus whitelabel & reseller setups](https://www.surplusintelligence.ai/docs/getting-started/whitelabel)
- [Surplus Terms of Service](https://www.surplusintelligence.ai/terms-of-service)
- [Surplus security & privacy](https://www.surplusintelligence.ai/docs/marketplace/security-privacy)
- [Surplus provider verification](https://www.surplusintelligence.ai/docs/marketplace/provider-verification)
- [Surplus Claude Code setup](https://www.surplusintelligence.ai/docs/guides/claude-code-setup)
- [Bankr: Surplus Intelligence](https://bankr.bot/agents/surplus-intelligence)
- [Alea Research on Surplus](https://alearesearch.substack.com/p/surplus-intelligence-an-order-book)
- [Anthropic workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces)
- [Anthropic Admin API keys](https://platform.claude.com/docs/en/manage-claude/admin-api-keys)
- [Anthropic API credits for subscribers](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers)
- [OpenRouter provisioning keys](https://openrouter.ai/docs/features/provisioning-api-keys)
- [OpenRouter create keys](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys.md)
- [LiteLLM budgets](https://docs.litellm.ai/docs/proxy/users)
- [Claude Code LLM gateway](https://code.claude.com/docs/en/llm-gateway)
- [x402 upto scheme](https://docs.x402.org/schemes/upto)
- [Hack Club AI](https://ai.hackclub.com)
- [Puter free LLM API](https://developer.puter.com/tutorials/free-llm-api/)
- [Codex Open Source Fund](https://codex.danielvaughan.com/2026/03/31/codex-open-source-fund)
- [Ona for Open Source](https://ona.com/stories/ona-for-open-source)
- [Token brokers grey market](https://theagenttimes.com/articles/token-brokers-build-multimillion-dollar-grey-market-for-unus-5589c285)
