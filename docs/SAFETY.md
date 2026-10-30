# Safety

Rules that protect claimers, funders and Oruno. Anything touching keys, money, claims or privacy must follow this file and have tests that prove it.

## 1. Money

- **Never issue above funding.** Total caps of a drop's keys ≤ confirmed funding. Enforced twice: in our code, and by the provider's workspace budget.
- **Funding is confirmed before keys exist.** A deposit counts only once it lands (USDC transaction confirmed, or card payment settled).
- **Every key has a hard cap and an expiry.** No exceptions.
- **Integer micro-dollars** (1 USD = 1,000,000). Never floating point.
- **Append-only ledger** from Phase 2: entries are added, never edited.
- **Reconcile daily** against provider usage; alert on any difference over $0.01.
- **Drops stay inside one calendar month** while the provider only offers day and month budget windows.

## 2. Abuse and farming

Public links attract farming. Defaults for every drop:

| Control | Default |
| --- | --- |
| Sign-in | X or GitHub required; wallet optional extra |
| Account age | Minimum (to be set; e.g. 6 months on X or GitHub) |
| Account activity | Minimum signals (followers, repos or commits; to be set) |
| Claims | One per person per drop; one per identity across linked accounts |
| Claim rate | Limit per IP and per minute |
| Cap size | Small by default ($5–10) |
| Revocation | Keys showing sharing (many IPs, round-the-clock use, spikes) are revoked |
| Approval mode | Funder approves each claim; recommended for caps of $100+ |

Grants are **usage permissions, not money**. They cannot be transferred, sold or cashed out.

## 3. Keys

- A key secret is shown **once**, only to the signed-in claimer. We store the provider key id, never the secret.
- Keys are never sent in public channels, plain email or chat.
- A claimer can revoke their own key; an operator can revoke any key.
- The admin (management) key lives only in the server's secret store, never in the repo or logs.

## 4. Privacy

- **We never store prompts or outputs.** Body capture on the provider stays off.
- Funders see usage numbers and outcomes claimers choose to share. Never content.
- Claimers are told plainly that providers and model sellers process their prompts, with a link to their terms.
- Collect the minimum personal data needed for eligibility.

## 5. Terms and honesty

- Claimers accept short Oruno terms at least as strict as Surplus's Terms, AUP and model provider terms (Surplus §8a).
- Oruno is responsible for claimers' use (Surplus §8b), so abuse handling is our job.
- **Never say or imply** that drops come from Anthropic, OpenAI or any model provider (Surplus §8c). Say "AI credit", name models plainly.
- Never weaken or misrepresent caps or routing (Surplus §8d).
- Never redistribute subscription credits whose terms forbid it (Claude Max, ChatGPT Pro and similar).

## 6. Legal checkpoints

- Before paid drops by others: a one-hour legal review of funding flow and terms.
- Before onchain funding pools (Phase 5): full review of custody and payments obligations.
- If an organisation is subject to GDPR or similar: request a data processing agreement from the provider.

## 7. Incidents

- A leaked or abused key is revoked within 24 hours of detection.
- Any overspend is absorbed by Oruno, recorded in `NOTES.md`, and fixed before the next drop.
