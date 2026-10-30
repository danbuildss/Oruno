# Drop engine

**Status: VERIFIED for Phase 2** (commit `33466ef`). How drops, sign-in and claims work, and the rules that keep them safe.

## Drops

| Field | Rule |
| --- | --- |
| `slug` | 3–48 chars, lowercase letters, digits, hyphens; unique |
| `cap_micro` | Positive integer micro-dollars, at most $1,000 per claim |
| `max_claims` | 1–10,000 slots |
| `models` | 1–10 model names |
| `starts_at`, `ends_at` | `ends_at > starts_at`, and both in the **same UTC calendar month** (provider budgets reset monthly, TH-4). Checked in the API and by a database constraint |
| Eligibility | `min_account_age_days`, `min_public_repos`, `min_contributions` (defaults 180 / 3 / 20, D-013/D-014) |
| `terms_version` | Claimers must accept this exact version |

**States:** `draft → active ⇄ paused → ended` (a draft can also be ended). Every change runs under a row lock and is audited.

## Sign-in (GitHub, D-017)

1. `start`: Oruno creates a random `state` and a PKCE verifier. It stores **only the hash** of `state`, with the verifier, for 10 minutes, and returns GitHub's authorize URL with the S256 challenge. No OAuth scopes are requested (public data only).
2. `callback`: the `state` is consumed atomically (single use, not expired). Oruno exchanges the code using the stored verifier, so a stolen code is useless without it.
3. It reads public signals: account creation date, public repos, followers, and contributions in the last year (GraphQL; null if unavailable).
4. It upserts the person and identity (unique GitHub user id; concurrent first sign-ins are handled), refuses blocked people, and issues a session token. Only the token's SHA-256 is stored; it lasts 24 hours.
5. The GitHub access token is used once and never stored. Query strings (which carry `code` and `state`) are stripped from request logs.

## Claims

A claim reserves one slot for one person. In one transaction:

1. **Lock the drop row** (`SELECT … FOR UPDATE`). Concurrent claims on a drop run one at a time.
2. Check the terms version, then whether the drop is claimable (active, inside its window, slots left).
3. Check that the person hasn't claimed already.
4. Check eligibility against the drop's thresholds.
5. Insert the claim (`pending`), increment `claims_count`, and audit it.

**Safety nets in the database:**
- unique `(drop_id, person_id)`;
- `claims_count <= max_claims`;
- positive `cap_micro`.

**Claim states:** `pending → active → exhausted | expired | revoked`; `pending → failed | revoked | expired`.

- In Phase 2, claims stay `pending`.
- Phase 4 makes a claim `active` by minting a provider key, or `failed` if minting fails.

**Revocation:** by the claimer (own claims only) or an operator (any claim, with a reason). A revoked claim **keeps its slot**: money may have been spent under it, and the same person can't claim again.

**Expiry job (`drops.expire`, every minute):** ends active or paused drops whose window is over, and expires their `pending` and `active` claims. It is idempotent.

## Attestations

When claiming, the claimer confirms:
- they accept the terms (exact version);
- they are 18 or older;
- they are not in a sanctioned jurisdiction (claimer terms §3).

## Not yet

- Funding checks (Σ caps ≤ confirmed funding): Phase 3.
- Key issuance: Phase 4.
- X sign-in: later drops (D-014).
- Detecting key sharing from usage: Phase 4+.
