# PHASE 34.2.2 — Supabase Post-Apply Verification & Cleanup Report

> Verification/report only. Nothing was created, altered, dropped, or deleted. No tables, columns, policies, buckets, or indexes were changed by this audit.

## Scope & method

Two layers were checked:

1. **Repo-side (fully verified here):** static duplicate/redundancy analysis of the whole migration set, the QA.1 pack's internal safety, the types drift guard, scoped `tsc`, and `eslint`.
2. **Live-DB (needs you to run one script):** I cannot query your Supabase directly from this environment, so I produced a **read-only verification script — `ZONO-QA1-Verify.sql`** (11 SELECT-only blocks). Run it in the SQL Editor; each block states its expected result.

---

## ⚠️ Most important finding first — the pack is very likely only PARTLY applied

Your earlier run **failed mid-way** at part 2 (the RLS block) on `agency_ai_feedback`. The Supabase SQL Editor executes statements top-to-bottom and **stops at the first error**, and the failing RLS `DO $$…$$` block is a single statement that **rolls back entirely** on failure. So the realistic applied state after that run is:

| Part | What | Likely applied? |
|---|---|---|
| 1 · storage buckets | 7 buckets + policies | ✅ probably yes (ran before the error) |
| 2 · RLS coverage | 394-table `_qa1_read` pack | ❌ rolled back (this is where it errored) |
| 3 · org memory | 3 tables | ❌ never reached |
| 4 · intelligence snapshots | 1 table | ❌ never reached |
| 5 · compute cache | 1 table | ❌ never reached |
| 6 · Ask ZONO log | 2 tables | ❌ never reached |
| 7 · performance indexes | index pack | ❌ never reached |

**Required fix (single step):** re-run the **corrected** `ZONO-QA1-Supabase.sql` (commit `c3dfc32` — the one with the `to_regclass(...)` existence guard). It now skips tables that don't exist in your DB, so it completes end-to-end. Everything is idempotent (`create table if not exists`, `insert … on conflict do nothing`, `drop policy if exists`), so re-running is safe even for the buckets that already applied.

`ZONO-QA1-Verify.sql` will then confirm the end state. Blocks 1–3 should return the 7 tables, 7 buckets, and RLS=true; if any come back empty, that part didn't apply.

---

## 1. Applied successfully (repo-verified)

- **Migration pack integrity:** all 7 files parse against the real Postgres grammar (libpg_query). The corrected RLS + index packs are existence-safe.
- **New tables typed:** the 7 QA.1 tables are present in the generated client types (309 typed tables, up from 302). `tsc` and `eslint` both clean on the QA.1 TypeScript.
- **Zero blast radius:** nothing in the existing app imports the new `platform-persistence` / `org-memory/persisted` modules yet — they are opt-in. All 183 pages and 38 API routes are untouched. The only edits to existing files were additive (`types.ts` row types + `package.json` script).

## 2. Failed / missing items

- **Live RLS pack + tables 3–7 + indexes:** almost certainly not yet applied (see the headline). Resolve by re-running the corrected pack.
- **Types drift (manual step outstanding):** the generated client still shows **85 tables queried but untyped** and **488 `as never` casts** across 104 legacy tables. These are pre-existing debt, not caused by 34.2. They only clear when you regenerate from the live project:
  ```
  supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/lib/supabase/types.ts
  npm run check:types-drift
  ```

## 3. Duplicates found

- **Duplicate tables:** none. No table is defined in more than one migration; the 7 new tables exist in exactly one file each.
- **Duplicate policy names:** none. The `_qa1_read` policies are generated dynamically with unique per-table names; new-table policies (`zom_select`, `zis_select`, …) are each defined once with `drop policy if exists` guards.
- **Duplicate index names (exact):** none from QA.1. Two *pre-existing legacy* duplicate index names exist in older migrations (`distribution_groups_perf_idx`, `distribution_comments_lead_idx`) — both created with `if not exists`, so harmless. Not introduced by this phase.
- **Logically redundant (superset) indexes — safe, low value to remove:**
  - `qa1_dpost_org_status_sched_idx (org_id, status, scheduled_at)` overlaps legacy `distribution_posts_scheduled_idx (org_id, scheduled_at)` — the legacy one is a prefix subset; Postgres keeps both. Keep both (the legacy still serves pure schedule-range scans).
  - `qa1_ptx_city_hood_date_idx (city_name, neighborhood_name, deal_date)` overlaps legacy `property_transactions_neighborhood_idx (neighborhood_name)` — different lead column; not redundant.
  - `qa1_zai_org_status_created_idx (organization_id, status, created_at)` vs legacy `zai_org_status_idx (organization_id, status, urgency)` — different trailing column; both useful.
  - Run verification block 7 to see any *exact* logical duplicates on the live DB (expected: none from this pack).

## 4. Safe to keep (do not remove)

Everything in the QA.1 pack is safe to keep. Specifically: all 7 new tables and their indexes, all `_qa1_read` policies, the 7 buckets, and the `qa1_*` performance indexes. The minor superset-index overlaps above cost only a little write/storage overhead and each still serves distinct query shapes.

## 5. Risky items (handle with care — do NOT auto-delete)

- **The RLS coverage pack is the only thing that can change app behavior.** It enables RLS on tables that may previously have had none, adding an org-scoped read policy in the same block. Because permissive policies OR together and writes use service_role, it should not reduce access — but **verification block 8** ("RLS enabled, zero policies = locked tables") is the one to read carefully. If a table your authenticated UI reads shows up there, that read would return empty. Expected there: only infra/system tables with no user-facing reads.
- **Do not** drop the two legacy duplicate index names or any `_qa1_read` policy to "tidy up" before confirming via the verify script — they are cheap and removing the wrong one could unindex a hot path or lock a read.

## 6. Cleanup recommendations (all optional, none urgent)

1. **Re-run the corrected pack** (required — this is the real fix, not cleanup).
2. Regenerate types from the live DB and run `npm run check:types-drift` until it reports 0 missing tables.
3. After the app is wired to the new stores, optionally drop the legacy `distribution_posts_scheduled_idx` **only if** verification block 7 proves it is a strict subset and query plans confirm the composite covers it — otherwise keep it.
4. Leave the two legacy duplicate index *names* as-is (idempotent, harmless).

## 7. Do-NOT-delete list

- The 7 QA.1 tables and every `zom_/zome_/zolp_/zis_/zcc_/zac_/zam_` index.
- All `_qa1_read` policies and the new-table `*_select` policies.
- The 7 buckets (`creative-references`, `property-media`, `documents`, `logos`, `agent-photos`, `office-assets`, `public-site-media`) and their storage.objects policies.
- `public.current_org_id()` and `public.is_zono_owner()` helper functions.
- Any pre-existing index on `properties`, `buyers`, `sellers`, `leads`, `distribution_*`, `property_transactions`, `zono_*` — these predate this phase.

## 8. Required fixes (ordered)

1. **Re-run `ZONO-QA1-Supabase.sql` (corrected, `c3dfc32`)** in the SQL Editor — completes fully now.
2. **Run `ZONO-QA1-Verify.sql`** — confirm blocks 1–3 return 7 tables / 7 buckets / RLS=true, and blocks 5–7 return 0 duplicate rows.
3. **Regenerate Supabase types** (manual, needs project id) → then `npm run check:types-drift` should report 0 missing.
4. **Smoke-test one authenticated dashboard load in staging** after the RLS pack applies, before production (the standard RLS-enable precaution). I verified zero code blast radius, but the live RLS toggle is the one thing worth eyeballing against a real session.

---

### Bottom line

Nothing is duplicated, nothing is broken, nothing needs deleting. The pack is clean and idempotent. The single real action item is that your first apply stopped at the RLS error, so **re-run the corrected pack**, then run the verification script to confirm the end state, and finish the manual types regen. All destructive-sounding items above are explicitly *keep*, not remove.
