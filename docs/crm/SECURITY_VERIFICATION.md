# ZONO — Security Verification (live)

Source: Supabase Security Advisor + direct schema queries on `tlrefajhyrqnjtmimaos` (zono-dev), read-only.

## Strong (verified present)
- **RLS everywhere:** 476/476 public base tables have RLS enabled. Core org tables carry 5 policies each, org-scoped via `current_org_id()`.
- **Org-scope helpers exist:** `current_org_id()`, `has_min_role()`, `is_org_member()`, `current_role_key()` (SECURITY DEFINER).
- **Service-role-only tables locked:** 11 tables have RLS enabled with no policy (webhook receipts, market sync, provider QA, registration_drafts) → only service_role can read them (INFO, acceptable).

## 🔴 Blocker
- **Private document storage is NOT in effect.** `storage.buckets.documents.public = true` on the live DB. Sensitive deal documents are served via permanent PUBLIC URLs. The code fix (private bucket + org-scoped 5-min signed URLs, migration `20270402`) is **not applied**. This is a live data-exposure risk. `property-media` public=true is expected (listing media); `documents` public=true is not.

## ⚠ Warnings (Supabase advisor, remediation links)
- **SECURITY DEFINER functions executable by `anon`/`authenticated`** via `/rest/v1/rpc/*`: `current_org_id`, `has_min_role`, `is_org_member`, `is_zono_owner`, `brokerage_allowed_cities`, `brokerage_city_visible`, `create_property_journey`, `current_role_key`. Review EXECUTE grants / switch to SECURITY INVOKER where unintended. (lint 0028/0029)
- **Function search_path mutable** (WARN): `set_updated_at`, `role_rank`, `seed_org_default_roles`, `journey_stage_for_status`, `journey_progress_for_stage`, `legal_documents_lock_signed` — set `search_path`. (lint 0011)
- **Leaked-password protection disabled** in Supabase Auth (WARN) — enable HaveIBeenPwned check. (auth)
- **Extensions in public schema** (WARN): `citext`, `pg_trgm`. (lint 0014)

## Not verified here (needs staging app)
JWT handling end-to-end, permission-escalation attempts through the app, audit-log population under real actions, service-role boundary at the API layer. Structural boundaries verified; live exploitation attempts not run.

Remediation base: https://supabase.com/docs/guides/database/database-linter
