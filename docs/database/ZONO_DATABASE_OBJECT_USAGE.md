# ZONO — Database Object Usage

Method: static scan of `.from("table")` literals in `src/**/*.ts` vs the authoritative replay schema (541 tables). Caveat: the codebase also uses `.from(x as never)` and dynamic table names, so "never referenced" **overstates** the dead set — treat as candidates, not confirmed dead.

| Metric | Value |
|---|---|
| Distinct tables referenced by code (literal) | 420 |
| Schema tables never literally referenced | 122 (candidate dead/experimental/future) |
| Code references NOT in schema | **1 — `journey_notes`** |

## Key finding
`journey_notes` is **referenced by code** and **exists in production**, but **no migration creates it**. A fresh environment (or CI rebuild) will lack the table → the code path breaks. This is the concrete cost of the orphan-table drift. Same recoverability risk (untested) for `approval_decisions` and `user_ui_preferences` if any code path reaches them.

## Candidate dead/experimental (sample of 122)
`ai_focus_items, ai_opportunities, ai_risks, automation_message_variants, automations, bi_reports, bi_snapshots, broker_discovery_runs, brokerage_change_log, brokerage_office_locations, brokerage_refresh_diffs …` — many are the intelligence/brokerage/meta tables accessed via `as never` (so likely used, not dead). A precise dead-object list requires resolving the `as never` + dynamic-name accesses (follow-up).

## Actions
- Confirm each of the 122 candidates as used-via-`as never` / experimental / genuinely dead before any removal.
- Give the 3 orphan tables migrations (recoverability).
