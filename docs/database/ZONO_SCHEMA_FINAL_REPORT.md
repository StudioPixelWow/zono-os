# ZONO — Production Schema Reconciliation: Final Report

**Program:** Authoritative Database Alignment
**Date:** 2026-08-03
**Repository state:** `origin/main` @ 7096473
**Scope:** Reconcile four sources of truth until every difference is explained. This program builds **no CRM features** (no Offers/Viewings/Commissions/AI/Automation/Dashboards/UI). Its only product is truth about the schema.

---

## 1. The four sources of truth

| ID | Source | How obtained | Table count |
|----|--------|--------------|-------------|
| **A** | Production database | live `information_schema` from the production Supabase project | **473** |
| **B** | Migration replay | clean replay of all **209** migrations on an empty PostgreSQL 16 DB (`zono_replay`) with a documented Supabase bootstrap | **541** |
| **C** | Repository schema | the migrations themselves — **C ≡ B by construction** (B is what C produces on a clean DB) | **541** |
| **D** | Generated TypeScript types | `src/lib/supabase/types.ts` | **310** |

The canonical schema is **B/C** — the deterministic result of replaying the committed migrations. Production (A) and the generated types (D) are measured against it. The full machine-readable capture is `zono-schema-manifest.json` (541 tables, 70 functions, 1,812 policies, 44 enums, RLS enabled on all 541 tables). The complete diff is `zono-schema-diff.json`; the human-readable diff is `ZONO_SCHEMA_DIFF.md`.

**Replay is reproducible.** All 209 migrations apply 209/209 on a clean database once the Supabase runtime is bootstrapped (roles `anon`/`authenticated`/`service_role`/`authenticator`; schemas `auth`/`storage`/`extensions`; extensions installed into `extensions` with `search_path` including it; `auth.uid()`/`role()`/`jwt()` and `storage.*` shims). The earlier "MIGRATIONS_FAILED" signal was environmental (an unqualified `gin_trgm_ops` resolving against a missing `search_path`), **not** broken migration SQL. The reproducible harness is `scripts/ci-migration-replay.sh`.

---

## 2. Every difference, explained

Reconciliation requires that **every** delta between the four sources has a named cause. There are five classes of difference; each is accounted for below. None is unexplained — but several are genuine defects that remain **open**, which is why the schema is not yet reconciled.

### 2.1 Migration-only tables — 71 (B/C present, A absent)
71 tables exist in the migrations but not in production (mostly the `meta_workspace_*` batch plus `copilot_*`, `creative_*`, `agency_*`, `zi_*` families). **Cause:** these migrations were committed but never deployed to production. **Status: OPEN — product decision.** Either the features are live/planned (deploy the additive migrations) or cancelled (remove the migrations from the repo). Until resolved, a clean rebuild produces 71 tables production does not have. *Explained, not closed.*

### 2.2 Production-only tables — 3 (A present, B/C absent)
`approval_decisions`, `journey_notes`, `user_ui_preferences` exist in production with **no migration provenance** — nothing in the repo creates them. **Cause:** applied to production out-of-band (dashboard/manual SQL) and never back-filled into a migration. **Status: OPEN — P0 recoverability defect.** `journey_notes` is the sharp edge: it is **referenced by application code** and present in production, but a fresh rebuild from migrations will not create it, so a from-scratch environment breaks. *Explained, not closed.*

### 2.3 Column-level drift on shared tables — 3 tables
- `properties`: replay has `formatted_address text`; production lacks it. Cause: part of an undeployed migration (2.1). 
- `agencies`: replay has 7 columns production lacks. Cause: undeployed migration columns (2.1). 
- `deals`: `commission_amount` and `value` are **`bigint` in production** but **`integer` in the migrations**. Cause: production was widened out-of-band; the repo is behind. Here **production is ahead of the repo**, the opposite direction from the others. **Status: OPEN.** *Explained, not closed.*

### 2.4 Types missing production tables — 163 (A present, D absent)
163 production tables are absent from the generated types and are reached in code via `.from(x as never)`. **Cause:** the committed `types.ts` was generated at an earlier schema state and never regenerated. This is a **type-safety gap**, not schema drift, but it means D ≠ A. **Status: OPEN.** *Explained, not closed.*

### 2.5 Stale type entries — 12 (D present, A absent)
The generated types still list 12 tables not in production (`agency_ai_feedback`, `creative_generation*`, `israel_neighborhoods`, `zi_*`, …) — the same earlier-state generation as 2.4, from before those objects diverged. **Status: OPEN — closes when D is regenerated.** *Explained, not closed.*

### 2.6 RLS correction (audit error retired)
An earlier audit claimed "109 tables without RLS." That was a **static-grep artifact and is false.** Direct inspection of the replayed schema shows RLS **enabled on all 541 tables**; only 13 are policy-less, and those are default-deny system tables — correct and safe. This difference is **explained and closed**: there is no RLS drift.

---

## 3. Object-usage reconciliation

From `ZONO_DATABASE_OBJECT_USAGE.md`: of the canonical tables, **420 are referenced by application code** and **122 are never literally referenced** (candidate-dead, with the caveat that dynamic `.from(x as never)` access can hide a reference, so this is a candidate list, not a delete list). Exactly **one** code-referenced object — `journey_notes` — is missing from the migration schema; that is the same P0 recoverability defect as §2.2, now confirmed from the usage side as well as the schema side.

---

## 4. Reconciliation plan (staged, not applied)

Full detail in `ZONO_DRIFT_RECONCILIATION_PLAN.md`. Summary, dependency-ordered:

1. **Stage 1 (P0):** add migrations for the 3 orphan tables from their production DDL (`create table if not exists`), so a clean rebuild includes them and `journey_notes` code paths work from scratch.
2. **Stage 2 (P0):** commit `ci-migration-replay.sh` as CI and land the `gin_trgm_ops` qualification + enum idempotency, so replay stays reproducible.
3. **Stage 3 (P1):** resolve the `deals` `bigint` vs `integer` mismatch with a reviewed widening migration (no-op on prod, upgrades a fresh DB).
4. **Stage 4 (P1, product decision):** deploy-vs-remove the 71 undeployed migrations (also closes `properties.formatted_address` and the 7 `agencies` columns).
5. **Stage 5 (P2):** regenerate `types.ts` from the canonical schema, closing the 163-table `as never` gap and the 12 stale entries.

**All stages are additive/forward-safe. No production data is rewritten. Nothing here has been applied.**

---

## 5. Acceptance status

The program's acceptance criterion is: **A ≡ B ≡ C ≡ D, with every difference explained.**

- Every difference **is** explained (§2) — there are zero *unexplained* differences. 
- But the four sources are **not yet identical**: 71 migration-only tables, 3 orphan production tables, `deals` type drift, and a 163+12 type gap all remain open. Each has a named cause and a staged fix, but the fixes have deliberately **not** been applied (this program's mandate is to establish truth and a plan, not to mutate production).

Because reconciliation requires the sources to be identical — not merely that their differences be understood — the criterion is not met.

---

## 6. Verdict

Schema Reconciliation Incomplete
