# 0005 — TypeScript and Postgres in one modular monolith

**Status:** Accepted · **Date:** 2026-10-30

**Context.** Small team, safety-critical money logic, need to move fast without fragile infrastructure.

**Decision.** TypeScript (Node.js), Next.js for pages, Fastify for the API, Postgres for data, in one deployable with clearly separated modules (core, ledger, providers). No microservices.

**Consequences.** Simple to run and test. Modules can be split out later if load requires it.
