# ZONO — Runtime Evidence (live DB verification)

Role: CTO/QA/DevOps certification. Target: the LIVE database the deployed app uses — Supabase project **`tlrefajhyrqnjtmimaos` ("zono-dev")**, Postgres 17, eu-west-1 — via the Supabase management API (read-only; **no rows written, no DDL, no test orgs created**, production untouched).

## What CAN be verified in this session
Database schema, RLS, triggers, indexes, storage bucket privacy, and Supabase advisors — all live. Real runtime evidence for Phases 1, 2, 5, 6.

## What CANNOT be verified here (and why)
- **Phase 3 (app journeys), Phase 4 (Playwright desktop/tablet/mobile), Phase 7 (OpenAI/Email/WhatsApp/Meta/Maps/Calendar):** require a running app + a staging environment. This sandbox has no deployed staging app and the egress proxy blocks Supabase/OpenAI HTTP. Not run. (Creative Studio was browser-verified live in an earlier session against the deployed preview; the Epic 3 CRM flows were not.)

## Phase 1 — Database (live findings)
- **476 public base tables; 476 have RLS enabled (100%).** 252 `updated_at` triggers present; core tables carry them.
- Core CRM tables exist and are healthy: buyers, sellers, leads, properties, deals, documents, notes, meetings, tasks.
- BLOCKER — schema/code drift: the Epic 3 tables **offers, offer_events, commissions, collections, collection_events, note_edits DO NOT EXIST** in the live DB, and the notes-enrichment columns (tags, mentioned_user_ids, is_archived, edited_at, edit_count) are absent. The Epic 3 code is deployed but migrations 20270402-20270405 were never applied. Every /offers, /commissions, /deals/[id] join and Notes-enrichment call would error at runtime.
- BLOCKER — no reliable migration pipeline: supabase_migrations.schema_migrations tracks only **10** versions (latest 20260804143529), while the DB has 476 tables built from hundreds of repo migrations. Migrations were applied out-of-band and are not recorded; a clean ordered "replay on a fresh DB" is not reproducible from tracked history.

## Phase 2 — Organization isolation (mechanism verified; live cross-org attempt not run)
- All 9 core org tables (buyers, sellers, leads, notes, tasks, documents, meetings, deals, properties): **RLS enabled, 5 policies each, org_id column present.** Enforcement uses current_org_id() / has_min_role() (present as SECURITY DEFINER functions).
- A live two-org (Alpha/Beta) app-level cross-access attempt was **not executed** — it needs a running app with two authenticated JWTs; creating test orgs in the live DB was avoided by design. Isolation verified at the policy/mechanism level, not by a live breach attempt.

## Evidence commands (reproducible)
list_projects; execute_sql (information_schema, pg_class, pg_policies, storage.buckets, supabase_migrations.schema_migrations); get_advisors security + performance. Project ref: tlrefajhyrqnjtmimaos.
