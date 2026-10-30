# Oruno

**Intelligence should move freely.**

Oruno lets anyone fund AI credit for other people. A funder sets a total amount and a cap per person, shares one link, and people claim a personal key they use in their own AI tools (Claude Code first) for free, until their cap runs out.

> "I've added $100 of AI credit. $5 each for 20 builders. Claim yours."

Built by Somehow Internet. Licensed under [Apache-2.0](LICENSE).

## Status

**Phase 2 — Drop and Claim Engine** (in review). See [`NOTES.md`](NOTES.md) for the current state and [`PLAN.md`](PLAN.md) for the roadmap.

## Run it locally

Requires Node.js 22, pnpm and Postgres 16 (or Docker).

```bash
pnpm install
cp .env.example .env            # then edit if needed
docker compose up -d            # or use your own Postgres with oruno_dev and oruno_test databases
pnpm migrate                    # create tables
pnpm operator:create "Your name"  # prints an operator API key once
pnpm dev                        # http://127.0.0.1:3000/health
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (wipes the test database), `pnpm build`.

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
| `docs/architecture/` | API, drop engine, database, providers, threat model |
| `docs/project/` | Changelog, experiments, session log |
| `docs/legal/` | Claimer terms (draft) |

Further documents (API, drop engine, credit ledger, operations) are added when their phase begins.
