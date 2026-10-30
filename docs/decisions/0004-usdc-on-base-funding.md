# 0004 — USDC on Base, deposited, is the primary funding method

**Status:** Accepted · **Date:** 2026-10-30

**Context.** The owner and the target ecosystem (Base, Bankr) are crypto-native. On Surplus, card credit is not withdrawable, while deposited USDC is.

**Decision.** Fund drops primarily with USDC on Base deposited to the provider account. Card funding comes later. Claimers never need a wallet.

**Consequences.** Unused funds can be returned or rolled over. Funding is publicly verifiable. Onchain funding pools (holding funders' money in a contract) wait for Phase 5 and a legal review.
