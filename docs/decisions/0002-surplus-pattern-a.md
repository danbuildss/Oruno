# 0002 — Surplus Intelligence Pattern A is the first provider

**Status:** Accepted · **Date:** 2026-10-30

**Context.** We need a provider that lets us mint keys for other people with hard caps, expiry and usage records, by API, and whose terms allow redistribution. Anthropic can't create capped keys by API. OpenRouter can. Surplus can, settles on Base, is used by Bankr, offers 20–35% median discounts on Claude models, and its Terms §8 allow reselling with conditions.

**Decision.** Use Surplus Pattern A (one provisioned buyer key per claimer, minted with an admin key). All provider calls go through a provider adapter. OpenRouter is the fallback.

**Consequences.** We must meet Surplus §8 conditions (claimer terms, responsibility for use, no model-provider branding, no weakening of caps). Supply quality is not verified by Surplus, so we use `trusted_only` routing. Open questions on lifetime budgets, per-request fees, supply sourcing and the "competing routing service" clause are tracked in `NOTES.md`.
