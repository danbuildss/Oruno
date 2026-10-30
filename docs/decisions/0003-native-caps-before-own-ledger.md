# 0003 — Phase 1 uses Surplus's native caps; our own ledger arrives in Phase 2

**Status:** Accepted · **Date:** 2026-10-30

**Context.** A financial-grade ledger and our own gateway are significant work. Surplus already enforces per-key hard caps, nested workspace budgets and expiry.

**Decision.** In Phase 1 (self-funded Drop #1) we rely on Surplus's caps, workspace budget and expiry, plus daily usage sync. Our double-entry ledger is built in Phase 2, when other people's money enters the system. No gateway of our own before Phase 4.

**Consequences.** Acceptance tests AT-3, AT-4, AT-8 and AT-12 must prove Surplus's controls hold before launch. Drops stay within one calendar month while only day and month budget windows exist.
