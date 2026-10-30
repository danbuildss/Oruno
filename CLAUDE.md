# CLAUDE.md

Instructions for AI coding sessions in this repo.

## Read first

Before changing anything, read:

1. `NOTES.md` — current state, open questions, the latest log entries
2. `docs/ROADMAP.md` — which phase we are in and what it allows
3. The docs for the area you are touching:
   - product or flows → `docs/PRODUCT.md`
   - code structure or data → `docs/ARCHITECTURE.md`
   - anything touching keys, money, claims or privacy → `docs/SAFETY.md`
   - provider integration → `docs/PROVIDERS.md`
4. `docs/decisions/` — do not contradict a decision without writing a new one that replaces it

## Rules

1. **Stay inside the current phase.** Do not build features from a later phase.
2. **Money and caps are safety-critical.** Never issue credit above what is funded. Every key gets a hard cap and an expiry. Integer micro-dollars only, never floating point.
3. **Never store prompts or model outputs.** Funders see usage, never content.
4. **Never store key secrets.** Keep key ids; a secret is shown to its claimer once.
5. **Never present Oruno as provided by or affiliated with a model provider** (Surplus Terms §8).
6. **Provider access goes through the provider adapter.** No Surplus-specific calls outside `providers/`.
7. **Nothing is "done" without tests.** Safety rules need tests that prove them.
8. **Update `NOTES.md`** at the end of every session: what was done, decided, learned, and next.
9. **Record decisions** in `docs/decisions/NNNN-title.md` when choosing between real alternatives.
10. Do not push, publish or spend real money without the owner's explicit go-ahead.
