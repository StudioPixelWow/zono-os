# ZONO — Schema Drift Report

Compared: (1) schema from repo migrations (clean rebuild, 541 tables) vs (2) live production (`tlref…aos`, 473 tables). Read-only on production.

| Metric | Migrations (rebuild) | Production |
|---|---|---|
| Public base tables | 541 | 473 |
| Policies | 1,812 | 1,690 |
| RLS-enabled | 541 (100%) | 473 (100%) |
| Tables w/o policy | 13 | 11 |

## Drift set

### Migration-only (68) — in repo, NOT deployed to production
Overwhelmingly the **Meta/Facebook workspace** (~50 `meta_*` tables from the future-dated `20270101–20270103` `meta_workspace_6_9_phase4/5/6` migrations) plus `copilot_*` (7), `creative_generation*`/`creative_qa_reports` (3), `agency_ai_feedback`/`agency_aliases`/`agency_resolution_candidates`, `broker_growth_strategy`/`broker_recommendation_events`, `zi_faq`/`zi_glossary`/`zi_learning_progress`/`zi_tutorials`/`zi_walkthroughs`, `israel_neighborhoods`, `mai_model_calibration`.
→ **Production is behind the repo:** these migrations were never deployed. Classification: *migration-only; safe to add on deploy* (or remove if features cancelled — product decision).

### Production-only (3) — in prod, NO migration provenance
`approval_decisions`, `journey_notes`, `user_ui_preferences` — **zero `create table` statements in the repo migrations**. Created outside version control (dashboard/manual or a removed migration). Classification: **dangerous for recoverability** — a fresh rebuild lacks them; the app code that uses them would break on a clean environment. Requires a reviewed additive migration to restore provenance.

## Machine-readable: `zono-schema-drift.json`.
## Not modified: production was only read.
