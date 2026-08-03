# ZONO — Migration Chain Inventory

- **Total migrations:** 209 (`supabase/migrations/*.sql`).
- **Ordering:** filename timestamp order; no duplicate versions detected; chain is monotonic except a **future-dated cluster** (3 files dated `20270101–20270103`, the `meta_workspace_6_9_phase4/5/6` batch) that sorts after the 2026 files.
- **Self-tracking:** raw `psql -f` does not populate `supabase_migrations.schema_migrations` (only the Supabase CLI/runner does) — expected, not a defect.
- **Required prerequisites (bootstrap) the chain assumes:** roles anon/authenticated/service_role/authenticator; schemas auth/storage/extensions; extensions `uuid-ossp`,`pgcrypto`,`pg_trgm` (and `btree_gin`/`btree_gist`) in `extensions`; `search_path` including `extensions`; `auth.uid()/role()/jwt()`; `storage.buckets`,`storage.objects`,`storage.foldername()`; `auth.users`.
- **Runtime:** full clean replay completes in a few seconds locally.
- **Naming inconsistencies:** none blocking. Org column convention is **`org_id`** across CRM tables (not `organization_id`).
- **Non-idempotent statements:** migration #1 creates enums without guards (see fixes).
- **Environment-dependent statement:** #11 `gin_trgm_ops` (search_path).
