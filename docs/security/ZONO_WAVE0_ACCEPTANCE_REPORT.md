# ZONO — Wave 0 Acceptance Report

Wave 0 is complete only if ALL are proven **in staging**. Current status:

| # | Criterion | Status | Note |
|---|---|---|---|
| 1 | sensitive document buckets private | ❌ | migration ready; not applied; prod buckets still public (open P0) |
| 2 | app document access via authorized signed URLs | ⚠️ | authz+validation core done+tested (17); signing/wiring pending staging |
| 3 | unauthenticated document access fails | ⚠️ | proven at decision layer; not at bucket runtime |
| 4 | inactive-user document access fails | ✓(unit) | file-access + org-scope tests; app-route runtime pending |
| 5 | cross-tenant document access fails | ✓(unit) | tested; DB runtime pending |
| 6 | critical tenant tables enforced isolation | ⚠️ | Tier-1 RLS migration ready; not applied; ~109 gap unenumerated on prod |
| 7 | Tier-1 service-role writes use org boundary | ❌ | boundary built+tested; 0 sites wired |
| 8 | two orgs pass isolation tests | ❌ | matrix+fixtures ready; 0 run at DB runtime |
| 9 | inactive users blocked on routes/actions | ⚠️ | boundary blocks; app-wide guard not wired |
| 10 | no record globally exposed via missing ownership | ❌ | not verified (needs staging query) |
| 11 | critical security errors observable | ❌ | none implemented |
| 12 | rollback instructions tested | ⚠️ | documented; not executed on staging |
| 13 | all unit/integration/build checks pass | ⚠️ | unit 65✓, tsc✓; integration suite not run (no runner/staging); build not run to completion (needs env) |
| 14 | no production env/data modified | ✓ | nothing applied to production |

**Verdict: Wave 0 INCOMPLETE.** Foundations built + unit-proven; every DB-runtime criterion is blocked on a staging environment that does not exist in this session.

---

## Runtime update (isolated branch `wave0-staging`, representative harness)
Now PROVEN at the database level (not just unit): **#5 cross-tenant isolation** (Alpha/Beta both directions, leak=0), **#6 tenant RLS enforcement** (representative Tier-1 tables — default-deny + org-scoped read), **#8 two-org isolation** (RLS read + client-write denial), **#3 unauthenticated/no-claim → 0 rows**, and the **identity backfill** (3→2 collapse, multi-role, no cross-org merge) with additive migrations applied at runtime.
STILL blocked: full 340-table schema at runtime (legacy migration replay FAILED on a fresh DB — see runtime evidence), app-route/session deactivation tests (need a running app), document bucket privatization (prod), service-role site wiring, observability. **Verdict remains: Wave 0 INCOMPLETE** — mechanisms proven, full-environment coverage + prod application pending.
