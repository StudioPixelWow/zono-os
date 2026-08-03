# ZONO CRM 360 — Launch Gates

The launch decision is binary: **Not ready** vs **Ready as a complete CRM 360**. No limited-module pilot. Each gate below is objective; current status is evidence-based.

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | All P0 integrity/security complete | ❌ | public doc buckets; 109 tables no RLS; deactivation unenforced; dup-person path |
| 2 | All A–Z P1 workflow items complete | ❌ | no offers, no commission engine, no viewings, no import, fragmented identity |
| 3 | Every critical workflow has automated integration coverage | ❌ | no integration runner exists |
| 4 | Every critical workflow passed browser QA | ❌ | only ad-hoc manual QA on a few surfaces |
| 5 | Mobile field workflows pass on real devices | ❌ | not verified on device |
| 6 | ≥2 organizations tested for isolation | ❌ | single org; no isolation suite; RLS bypass risk |
| 7 | Multiple agents & roles tested | ❌ | single-owner account; team paths unverifiable |
| 8 | CRM import tested on realistic data | ❌ | no CRM import pipeline exists |
| 9 | No production screen shows demo/placeholder/fake/unexplained data | ⚠️ | QA fixed several (₪0, counters, scores); branded AI backend-only; territory 0% |
| 10 | No visible module is an empty shell | ❌ | graph render, territory metrics, branded AI readers, WhatsApp inbox stub |
| 11 | Unfinished modules hidden or completed | ❌ | no feature-readiness gating |
| 12 | Full lead→commission lifecycle works | ❌ | breaks at offers, viewings, commissions (workflow matrix: 1/30 fully ✅) |
| 13 | Reporting reconciles with records | ⚠️ | BI is live-computed (good); no automated reconciliation tests |
| 14 | Commission calculations reconcile | ❌ | no commission engine to reconcile |
| 15 | All actions auditable | ⚠️ | audit_log exists but best-effort, not wired to most mutations |
| 16 | Backup & rollback procedures documented | ❌ | not documented |
| 17 | Monitoring & error reporting active | ❌ | no Sentry/observability |
| 18 | 30-day supervised validation w/o another CRM completed | ❌ | not started; blocked by gates 1–2 |

**Gates passed: 0 / 18** (⚠️ partial: 4).

## Path to green (dependency-ordered)
1. **Security P0s** (gates 1, 6, 17) — private buckets, RLS everywhere + isolation suite, deactivation, error tracking.
2. **Identity + import** (gates 2, 8) — persons model, CRM import.
3. **Transactional spine** (gates 2, 12, 14) — offers, viewings, commission engine, full deal lifecycle.
4. **Close the loops** (gates 9–11) — inbox real send, opportunity→person, feature-readiness gating.
5. **Test + QA** (gates 3–5, 13, 15) — integration + isolation + reconciliation suites, browser + mobile E2E, audit wiring.
6. **Validation** (gate 18) — supervised 30-day design-partner run once 1–5 are green.

Only when **all 18 gates are green** is ZONO "Ready as a complete CRM 360." The 30-day validation is a validation step, not a commercial launch.
