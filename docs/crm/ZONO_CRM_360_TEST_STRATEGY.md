# ZONO CRM 360 — Test Strategy

Current state: the repo has **no test runner** (only `tsx` + `eslint`; no vitest/jest). Verification to date has been pure-module `tsx` scripts + `tsc` + manual browser QA. A CRM 360 launch needs real integration coverage of the lifecycle.

## Layers

1. **Pure-unit (exists, extend).** `tsx`-runnable tests for pure logic (already used: connectivity, list-display, prediction followup, marketplace counts, score-scale, self-match). Cheap, deterministic. Extend to every pure engine (matching scoring, commission math, dedup resolver, import validation).

2. **Integration (missing, required).** Adopt a runner (vitest) with a Supabase test schema (or a disposable branch DB). Each of the 30 workflow scenarios becomes an integration test asserting: state changes, timeline entries, tasks created, reporting deltas, permissions, and rollback. These are the launch-gating tests.

3. **Tenant-isolation suite (missing, P0).** For every CRM entity, a two-organization test proving no cross-org read/write — run against the service-role write paths, since that is where the risk lives.

4. **Browser E2E (partial, manual).** Playwright is available (Chromium preinstalled). Automate the launch journey + the lead→commission spine + mobile viewport. Replace ad-hoc manual QA with recorded E2E for the critical paths.

5. **Reconciliation checks (missing, required for financial).** Assertions that reporting/commission numbers reconcile with underlying records (sum of deal commissions == commission report; pipeline counts == deal rows).

## Priorities
- **Before any external exposure:** tenant-isolation suite (P0), security gate tests (signed URLs, disabled-user block), and the reconciliation checks.
- **Before design-partner validation:** integration coverage of all 30 workflow scenarios green; E2E of the lead→commission spine; import pipeline tests (valid/partial/duplicate/rollback); mobile E2E on a real device.

## Coverage gate (launch)
Every launch-critical workflow has: ≥1 integration test (state + timeline + tasks + reporting), ≥1 permission test, and a documented manual QA pass. No workflow ships "verified by code inspection" only. No fix marked done without a green test + before/after evidence (the discipline already applied in QA Stages 1/3/4).

## Tooling actions
- Add `vitest` + a test DB harness (Supabase branch or local stack).
- Add a CI job: `tsc --noEmit`, `eslint`, `vitest`, and the isolation suite.
- Add an RLS-coverage lint (fail build if a tenant table lacks a policy).
