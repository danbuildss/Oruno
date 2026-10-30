# Drop #1

The first credit drop: we fund it ourselves, post it on X, and learn whether people claim, use it, and build something. Runs in Phase 1.

## Settings

| Setting | Value |
| --- | --- |
| Funder | Oruno (self-funded) |
| Total | $100–200 |
| Cap per person | $5 (or $10 if the per-request fee applies to API keys) |
| Claims | 20–40 |
| Duration | 14 days, inside one calendar month |
| Sign-in | X or GitHub, with minimum account age and activity |
| Provider | Surplus, Pattern A, `trusted_only` routing |
| Models | 1–3 Claude-class models that pass AT-9 |
| Tool | Claude Code |
| Where we post | X first; Telegram and Discord communities, especially African developer communities |

## Launch post (draft)

> I've added $200 of AI credit for builders who want to try vibe coding.
> $5 each, first 40 people. Use it in Claude Code on your laptop. No subscription, no card.
> Claim yours: [link]

## Claimer setup (shown after claiming)

```bash
export ANTHROPIC_BASE_URL="https://api.surplusintelligence.ai/anthropic"
export ANTHROPIC_AUTH_TOKEN="<your key>"
export ANTHROPIC_API_KEY=""
claude
```

Plus, in plain words:
- The key is for you only; shared keys get switched off.
- When your $5 runs out, requests stop. You will never be charged.
- If Claude Code shows an "invalid request" error, your credit may be used up. Check your balance on the "My key" page.
- Your prompts are processed by AI providers and sellers on the Surplus marketplace; Oruno never stores them.

## What we measure

| Metric | Target |
| --- | --- |
| Claims completed | 20–40 |
| Claimers who used their key (10+ requests) | ≥ 60% |
| Claimers active on 3+ days | Tracked |
| Claimers who used their full cap | Tracked (high = demand) |
| What people built (shared links) | ≥ 8 |
| Abuse attempts blocked / keys revoked | Tracked; low |
| Cost per active claimer | Tracked |
| People asking "how do I fund a drop?" | ≥ 3 |

## After the drop

- Short survey: what did you build, did it help, would you want more.
- Post the results on X: claims, usage, what people built.
- Contact everyone who asked to fund a drop.
- Write findings in `NOTES.md` and decide on Phase 2.
