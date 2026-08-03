# ZONO — Wave 0 Runtime Evidence (isolated Supabase branch)

Environment: Supabase branch **wave0-staging** (`project_ref xsaihtxeiqofqepcykex`, parent `tlref…aos`, `with_data=false`). **Not production.** Production untouched.

## Branch finding (migration health)
Creating the branch replayed the parent's 209-migration history and returned **MIGRATIONS_FAILED** with **0 public tables** — the legacy migration chain does not cleanly replay on a fresh database. This is a real migration-safety issue for any new environment/CI. A focused representative harness was stood up instead to prove the Wave 0 mechanisms at the DB level.

## RLS isolation — PROVEN at the database level (authenticated role + JWT org claim)
| Actor (JWT org) | buyers visible | documents visible | orgs visible | cross-org leak |
|---|---|---|---|---|
| Alpha | 2 | 1 | 1 | **0** |
| Beta | 1 | 1 | — | **0** (alpha_rows_leaked) |
| no org claim | **0** | — | — | default-deny |

- Even an explicit `WHERE organization_id = <other org>` returns **0 rows** under RLS.
- **Client write blocked:** an `authenticated` INSERT was rejected by RLS (no client write policy); `sneaky_rows = 0` after the attempt. Service-role/superuser sees all 3 rows → confirms service-role BYPASSES RLS, so the app-layer org-scope boundary is the write enforcement point (as designed).

## Additive migrations — APPLIED cleanly at runtime on the branch
`persons_identity_additive` ✓, `import_pipeline_additive` ✓ (persons, person_identifiers, person_roles, import_batches, import_rows created; nullable person_id added to leads/buyers/sellers). No existing row rewritten.

## Identity backfill dry-run — on real seeded rows
| Org | role-rows | distinct persons | collapsed |
|---|---|---|---|
| Alpha | 3 | **2** | 1 (buyer+seller "טל זטלמן", different phone formatting → one person by normalized phone/email) |
| Beta | 1 | 1 | 0 |
- **No cross-org merge** (org-scoped). After backfill INSERT: Alpha authenticated sees **2 persons**, and the collapsed person holds **2 roles (buyer + seller) under one identity** (`tal_roles=2`), `beta_leak=0` — the unified multi-role identity model, proven at runtime.

## What this proves vs. what remains
Proven at DB runtime: org-scoped RLS enforcement (read isolation both directions + default-deny), client-write denial, additive migration applicability, and the identity dedup + multi-role + isolation loop. NOT proven here: the FULL 340-table production schema at runtime (blocked by the legacy migration replay failure) and app-route/session behavior (needs a running app). Recommendation: fix the migration-replay failure so a full-schema staging branch can be built, then run the complete two-org matrix across all Tier-1 tables.
