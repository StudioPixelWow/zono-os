# ZONO CRM 360 — Design Partner Defects

**Date:** 2026-08-05 · **Target:** staging `zono-dev`. Machine-readable copy: `design-partner-defects.json`.

| ID | Sev | Domain | Summary | Status |
|---|---|---|---|---|
| DEF-1 | **P1** | security / privilege-escalation | `users_update` RLS let a member self-set `role_id` → self-promotion to admin. | ✅ **FIXED** (guard trigger, live 42501 verified) |
| DEF-2 | **P1** | security / auth-config | Leaked-password protection still disabled. | ⛔ **OPEN** — owner must enable in dashboard |
| DEF-3 | P2 | lint | 5 `no-explicit-any` errors in a dev smoke script. | ✅ FIXED (scoped disable) |
| DEF-4 | P2 | lint-warnings | 29 eslint warnings (`<img>`, unused vars). | OPEN (backlog) |

**P0:** none. **P1 remaining:** DEF-2 (leaked-password — owner action). **P1 fixed:** DEF-1.

App-layer gates still blocked on deployment (not defects, but launch-blocking gates): browser E2E, app tenant isolation, app feature smoke, external monitoring, responsive/device — see `DESIGN_PARTNER_BLOCKERS.json` (DP-1, DP-3..DP-6).

## Note on severity discipline
DEF-1 was a genuine P1 self-escalation path — fixed and runtime-verified, not downgraded. DEF-2 stays P1 and OPEN because it depends on an owner dashboard action this session cannot perform; it is not marked resolved.
