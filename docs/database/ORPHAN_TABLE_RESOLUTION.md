# ZONO CRM 360 — Orphan Table Resolution (Phase 1)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging only. Production never touched.
**Date:** 2026-08-05

Three tables existed in the staging database but were defined by **no** repository migration (reverse drift found during the Repository ⇄ Database reconciliation). Each was inspected live and given exactly one resolution.

## Live inspection (all three)

| Property | approval_decisions | journey_notes | user_ui_preferences |
|---|---|---|---|
| Rows (staging) | 0 | 0 | 0 |
| RLS | enabled | enabled | enabled |
| Policies | 2 (select org; insert org+agent+self) | 2 (select org; write org+agent) | 1 (all org+self) |
| Triggers | 0 | 0 | 0 |
| Indexes | 3 (pkey, org, org+bundle) | 2 (pkey, org+entity) | 3 (pkey, uniq(user,key), user) |
| Foreign keys | org→organizations (cascade), decided_by→users (set null) | org→organizations (cascade), author→users (set null) | org→organizations (cascade), user→users (cascade) |
| Check constraints | decision in (approved,rejected) | entity_type in (buyer,seller,lead,property) | — |
| Code references | **0** | **1** (`journey-backfill/service.ts`) | **0** |
| RPC / view / cron / dynamic refs | none found | none found | none found |
| Migration provenance | none recoverable | none recoverable | none recoverable |

### Full live DDL

**approval_decisions** — `id uuid pk`, `org_id uuid NN →organizations`, `bundle_id text NN`, `entity_type text`, `entity_id text`, `decision text NN check(approved|rejected)`, `reason text`, `decided_by uuid →users`, `decided_at timestamptz NN now()`. Indexes: pkey(id), org_idx(org_id), bundle_idx(org_id,bundle_id). RLS: select `org_id=current_org_id()`; insert `org_id=current_org_id() and has_min_role('agent') and decided_by=auth.uid()`.

**journey_notes** — `id uuid pk`, `org_id uuid NN →organizations`, `entity_type text NN check(buyer|seller|lead|property)`, `entity_id uuid NN`, `author_id uuid →users`, `body text NN`, `created_at timestamptz NN now()`. Index: entity_idx(org_id,entity_type,entity_id). RLS: select org; write (ALL) `org_id=current_org_id() and has_min_role('agent')`.

**user_ui_preferences** — `id uuid pk`, `org_id uuid NN →organizations`, `user_id uuid NN →users`, `key text NN`, `value jsonb NN default '{}'`, `updated_at timestamptz NN now()`. Unique(user_id,key). Indexes: pkey(id), user_idx(user_id). RLS: ALL `org_id=current_org_id() and user_id=auth.uid()`.

## Resolutions

### 1. `journey_notes` → **ADOPT INTO REPOSITORY** ✅ applied

Code-referenced (`src/lib/journey-backfill/service.ts` selects it as a backfill source keyed by `(entity_type, entity_id)`), so per the directive it gets an **additive adoption migration**, not a drop. Migration `supabase/migrations/20270201120000_adopt_journey_notes.sql` reproduces the exact live shape as `create table if not exists` + index + RLS + policies + provenance comment — no destructive rewrite. Applied to staging (idempotent no-op on the existing table; records the tracking row). **Drift resolved: the repository now defines this table.**

### 2. `approval_decisions` → **DEPRECATE, reviewed drop prepared** ⚠ not applied

0 rows, 0 code references. It is a generic `bundle_id`-keyed approve/reject log that **overlaps existing domain-specific approval models already in active use** — `meta_approval_request` (Meta content), `offers.status='accepted'` + `offer_events` (offer acceptance), and `commissions.status='approved'` (commission gate). Per the directive, a duplicate approval system must **not** be built around it. A reviewed drop is prepared at `docs/database/reviewed-drops/DROP_approval_decisions.sql` (deliberately outside `supabase/migrations/` so it is never auto-applied) with the drop statement commented out pending product-owner sign-off. **Not dropped automatically.**

### 3. `user_ui_preferences` → **DEPRECATE, reviewed drop prepared** ⚠ not applied

0 rows, 0 code references; no other UI-preferences table exists and nothing uses this one — so there is no demonstrated product owner or use path. Per the directive, adopt only with a real owner + use path; absent that, it is not adopted. Reviewed drop prepared at `docs/database/reviewed-drops/DROP_user_ui_preferences.sql` (commented out, outside the migrations folder). If a settings feature that uses this shape is planned, re-classify as ADOPT. **Not dropped automatically.**

## Post-resolution reconciliation state

| Direction | Before Phase 1 | After Phase 1 |
|---|---|---|
| Repo-defined tables missing from staging | 0 | 0 |
| Staging tables not defined by any repo migration | 3 | **1 resolved (journey_notes adopted); 2 remain as documented, reviewed-drop-pending exceptions** |

Per the acceptance gate ("all 3 orphan tables reconciled **or** formally time-bounded"), the two remaining tables are **formally time-bounded exceptions**:

| Table | Owner | Reason | Expiry / review-by |
|---|---|---|---|
| approval_decisions | Backend/CRM owner (TBD by Tal) | Unused; overlaps live approval models; awaiting sign-off to drop | 2026-09-05 (30 days) |
| user_ui_preferences | Frontend/settings owner (TBD by Tal) | Unused; no accessor; adopt only if a settings feature claims it | 2026-09-05 (30 days) |

At review-by, either apply the prepared reviewed drop (after re-confirming 0 rows / 0 refs / no dependency) or, if a use path has emerged, replace with an adoption migration.
