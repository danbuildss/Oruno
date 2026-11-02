# Oruno

**Intelligence should move freely.**

Oruno lets anyone fund AI credit for other people. A funder sets a total amount and a cap per person, shares one link, and people claim a personal key they use in their own AI tools (Claude Code first) for free, until their cap runs out.

> "I've added $100 of AI credit. $5 each for 20 builders. Claim yours."

Built by Somehow Internet. Licensed under [Apache-2.0](LICENSE).

## Status

**Phase 7 — Pilot preparation** (nothing deployed). Real Surplus (Phase 4b) not yet connected. Hosting plan: website on Vercel, API in one container (D-025, [`DEPLOYMENT.md`](docs/operations/DEPLOYMENT.md)). See [`NOTES.md`](NOTES.md) for the current state and [`PLAN.md`](PLAN.md) for the roadmap.

## Run it locally

Requires Node.js 22, pnpm and Postgres 16 (or Docker).

```bash
pnpm install
cp .env.example .env            # then edit if needed
docker compose up -d            # or use your own Postgres with oruno_dev and oruno_test databases
pnpm migrate                    # create tables
pnpm operator:create "Your name"  # prints an operator API key once
pnpm web:build                  # build the claim website into web/dist
pnpm dev                        # http://127.0.0.1:3000/ (PROVIDER=fake: simulated keys)
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (wipes the test database), `pnpm e2e` (browser tests; also uses the test database, so don't run both at once), `pnpm build`.

Website development: run `pnpm dev` and `pnpm web:dev` together (Vite forwards `/v1` to port 3000).

## Documentation

| File | Purpose |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Operating instructions for AI development sessions |
| [`NOTES.md`](NOTES.md) | **Project memory:** status, what works, what's broken, approvals, next task |
| [`PRODUCT.md`](PRODUCT.md) | Product definition, vision, principles, V1 boundaries |
| [`PLAN.md`](PLAN.md) | Phases with objectives, deliverables, acceptance criteria |
| [`TASKS.md`](TASKS.md) | Task tracker |
| [`DECISIONS.md`](DECISIONS.md) | Append-only decision log |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System overview |
| [`TESTING.md`](TESTING.md) | Test strategy, cases, commands, results |
| [`BACKEND_PROOF.md`](BACKEND_PROOF.md) | Evidence required before any frontend work |
| `docs/research/` | Market research, competitors, validation plan |
| `docs/architecture/` | API, drop engine, credit ledger, database, providers, threat model |
| `docs/operations/` | Runbook (draft) |
| `docs/project/` | Changelog, experiments, session log |
| `docs/legal/` | Claimer terms (draft) |

Further documents (API, drop engine, credit ledger, operations) are added when their phase begins.
