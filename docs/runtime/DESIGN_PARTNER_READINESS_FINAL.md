# ZONO CRM 360 — Design Partner Readiness (FINAL)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. **Production never touched.**
**Date:** 2026-08-05

## Verdict

> ## Staging Ready, Design Partner Not Ready

Chosen honestly against the acceptance gate: the **database-layer** gates are met and evidenced live; the **application-layer** gates (deploy, browser E2E, app tenant isolation, app feature smoke, monitoring) and **leaked-password protection** are open, and the program forbids issuing the top verdict without runtime evidence. No production verdict is issued.

## Acceptance-gate scorecard

| Gate | Status | Evidence |
|---|---|---|
| All 3 orphan tables reconciled or formally time-bounded | ✅ | journey_notes adopted; approval_decisions + user_ui_preferences = time-bounded reviewed-drop exceptions (`ORPHAN_TABLE_RESOLUTION.md`) |
| Internal SECURITY DEFINER RPCs not executable by anon/authenticated | ✅ | 9 RPCs revoked; live denial `42501` (`SECURITY_DEFINER_RPC_HARDENING.md`) |
| Critical FK indexes applied | ✅ | 37 covering indexes; 82→46 unindexed (`FK_INDEX_HARDENING.md`) |
| Leaked-password protection enabled in staging | ⛔ open | not automatable via MCP; owner must enable in dashboard (`STAGING_AUTH_HARDENING.md`) |
| Staging build deployed | ⛔ open | no deployment in-session (`STAGING_DEPLOYMENT_EVIDENCE.md`) |
| Critical CRM browser journeys pass | ⛔ open | 0/10 executed (`FULL_JOURNEY_RESULTS.md`) |
| Alpha/Beta application isolation passes | ⛔ open (DB-layer ✅) | RLS 100% verified; app-surface probes pending (`APP_TENANT_ISOLATION_RESULTS.md`) |
| Private document access passes | ◐ DB policy ✅, app pending | private bucket + org storage policy verified; UI test pending |
| Feature families pass app-level smoke | ⛔ open (DB smoke ✅) | 8/8 DB-runtime; 0/8 app (`FEATURE_FAMILY_SMOKE_RESULTS.md`) |
| Migration replay passes | ◐ idempotency ✅ | 3 hardening migrations re-run clean; full clone-replay needs a paid branch |
| Monitoring can detect critical failures | ◐ checks ✅, alerting open | SQL checks ready; external alerting pending (`STAGING_MONITORING_READINESS.md`) |
| No P0 security/data-integrity blocker | ✅ | 0 advisor ERRORs; RLS 100%; dispatcher RPCs locked down |
| Production not touched | ✅ | staging-only throughout |

## What was completed this session (evidenced)

- **Schema closure:** orphan `journey_notes` adopted into the repo (exact live shape); 2 remaining orphans documented as time-bounded reviewed-drop exceptions. Forward repo→staging drift remains **0**; RLS **553/553**.
- **Security hardening:** 9 Meta dispatcher RPCs are now service-role-only — verified by ACL, `has_function_privilege`, and a live `permission denied` on an `authenticated` call. 0 advisor ERRORs.
- **Performance hardening:** 37 covering FK indexes on the cascade/queue/join/RLS hot paths; unindexed FKs 82 → 46 (remainder = documented low-value backlog).
- **Auth:** membership fails closed and roles re-evaluate per statement (verified from RLS helpers); leaked-password protection flagged for owner enablement.
- **Migrations:** 3 additive hardening migrations applied to staging and proven idempotent; tracked migrations 35 → 38.

## What remains for Design Partner Ready

1. Owner enables leaked-password protection (dashboard) + confirms no self-role-update RLS policy.
2. Deploy `creative-lab-cert` to a staging URL bound only to `tlrefajhyrqnjtmimaos`, secrets server-side, outbound integrations disabled/test-only (`STAGING_DEPLOYMENT_EVIDENCE.md`).
3. Run the 10 CRM browser journeys + 8 app-level feature smokes + Alpha/Beta cross-tenant probes; capture pass/fail.
4. Wire external monitoring/alerting (`STAGING_MONITORING_READINESS.md`).
5. Re-issue this verdict on the evidence.

See `DESIGN_PARTNER_BLOCKERS.json` for the structured blocker list.
