# ZONO — Design Partner Readiness

Question: can one brokerage operate entirely inside ZONO for 30 days? **Answer from evidence: No — not yet.**

## Blockers (must clear)
1. **Epic 3 is non-functional on the live DB** — offers, commissions, collections, and notes-enrichment tables/columns are missing; those screens would error. A brokerage cannot run offers→deal→commission→collection today.
2. **Document confidentiality** — the `documents` bucket is public on the live DB; a design partner's contracts would be exposed by URL. Must be private + signed before any real client data.
3. **No verified end-to-end journey** — the lead→…→collection chain is reachable in code but has never been executed against a running app; no E2E, no isolation breach test, no load evidence.
4. **Migration discipline** — the environment cannot be reliably rebuilt (tracked migrations ≠ schema). A design-partner deployment needs a reproducible DB.

## Already strong (credit where due)
- 476/476 tables RLS-enabled; org-scoped policies + role helpers on all core tables.
- Creative Studio verified live earlier (3-options ad generation with real assets).
- Full CRM feature surface exists in code (Epic 1/2/3) and passes tsc/eslint + unit tests.

## Minimum path to a 30-day design partner
Clear blockers 1–4 → run the 18-journey Playwright suite + Alpha/Beta isolation on staging → 1-week soak on staging with seeded data → then onboard one partner on an isolated project with backups.
