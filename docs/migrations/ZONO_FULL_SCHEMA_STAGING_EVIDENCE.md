# ZONO — Full-Schema Staging Evidence

A **full-schema** environment was achieved by replaying all 209 migrations into a clean local Postgres 16 with the documented bootstrap (541 tables, 100% RLS). This is a complete rebuild, not the representative mini-schema.

- **Created:** yes — local Postgres 16.13, DB `zono_replay`, 541 tables + 70 functions + 1,812 policies (full schema).
- **Proof it is not production:** local container Postgres on port 55432; no Supabase/production credentials; no production data (seeded 2 synthetic orgs only). Production untouched (read-only drift queries only).
- **Wave 0/1 additive migrations on the full schema:** `persons_identity_additive` ✅ applied, `import_pipeline_additive` ✅ applied (persons/person_identifiers/person_roles/person_merge_log/import_batches/import_rows/import_mappings created). `tier1_rls_hardening` ✅ now a no-op (corrected). All on the real 541-table schema.
- **Application connection / build / route tests:** NOT run — a full Next.js app needs its env/secrets and a server; out of scope for the DB-level recovery. tsc on the changed modules is clean; the app build against this DB is the follow-up once the fix is committed and a real Supabase branch is rebuilt.
- **Supabase branch rebuild:** pending — requires committing Fix 1+2 (bootstrap/search_path + qualify `gin_trgm_ops`) so a fresh branch reaches 541 tables instead of failing at #11.

The local full-schema DB is equivalent evidence for schema reproducibility and DB-level RLS; the remaining gap is a *Supabase-branch* rebuild + app-route tests.
