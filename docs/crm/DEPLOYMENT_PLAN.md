# Deployment Plan (Phase 3)

Principle: never mutate production directly. Rebuild on a dedicated STAGING Supabase project first, verify, then promote. Because live migration tracking is untrustworthy (10 vs 214), do NOT attempt an incremental `db push` against the existing DB — do a clean replay on staging and diff.

## Sequence
1. **Provision staging** — a dedicated non-production Supabase project (separate ref, isolated DB/storage/auth; outbound comms disabled; test-org data only). Never point it at production data.
2. **Clean replay** — apply all 214 migrations in canonical order to the empty staging DB (`supabase db reset` / ordered psql). Expect 100% success, no manual SQL, no dashboard edits. Capture per-migration result.
3. **Seed minimal** — one org + one user (or two orgs for isolation tests).
4. **Runtime verify on staging** (see RUNTIME_DEPLOYMENT_VERIFICATION) — Epic 3 tables/columns exist, documents bucket private, signed URLs, cross-org denial.
5. **Promote to production** — only the DELTA the reconciliation identified (the 77 undeployed tables + notes columns + documents-private + their RLS/indexes/triggers). Since every outstanding migration is additive + guarded (`create table if not exists`, `add column if not exists`, `do $$ … exception when insufficient_privilege`), forward application is low-risk and idempotent. Apply in canonical order; re-run is a no-op.

## Per-migration attributes
- **Order:** canonical filename order (Phase 1).
- **Dependencies:** each batch references earlier tables (organizations, users, deals, buyers…); order preserves them. Epic 3 (`20270402–05`) depends on organizations/users/deals/buyers/sellers/properties + `current_org_id()/has_min_role()/set_updated_at()` — all present since 2026-06.
- **Idempotency:** outstanding migrations use `if not exists` / guarded RLS → safe to re-apply.
- **Rollback:** additive tables → rollback = `drop table if exists` (reverse order) on staging; on production prefer roll-forward. Storage: revert = set bucket public + restore public-select policy.
- **Downtime:** none (additive DDL, `create table`/`add column`; no destructive locks on hot tables). The one behavioral change is `documents` bucket → private: coordinate with any external links (legacy public URLs kept working via the code's fallback).

## Guardrails
- Rotate the OpenAI/Supabase keys exposed in chat before any production step.
- Take a database backup + note the restore point before applying the delta to production.
