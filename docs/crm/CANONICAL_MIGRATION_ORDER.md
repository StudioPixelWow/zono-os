# Canonical Migration Order (Phase 1)

Source: `supabase/migrations/*.sql` on `creative-lab-cert`.

- **Total migration files: 214.** All names match `^\d{14}_.*\.sql` (timestamp-prefixed).
- **Duplicate timestamp prefixes: 0** (no version collisions).
- **Malformed/orphan filenames: 0.**
- Canonical order = ascending filename (lexicographic == chronological). First: `20260618090000_extensions_and_enums.sql`. Last: `20270405120000_commissions_collections.sql`.
- Migration-batch spine (chronological): core (org/roles/users) → buyers/sellers/leads/deals/matching → journeys → automation → documents/legal → communication/whatsapp → creative-studio + creative-dna → brokerage-data → meta-workspace 6.x → **6.9 phases 1–4 (meta social)** → creative_runtime_persistence → **Epic 3 (20270402–20270405)**.

## Integrity notes
- The repo order is clean and reproducible **on paper**. The problem is not order — it is that most recent batches were never applied to the DB (see DATABASE_RECONCILIATION).
- `supabase_migrations.schema_migrations` on live tracks only **10** versions (latest `20260804143529`) — it does NOT reflect the 214-file history, so it cannot drive a `supabase db push` catch-up reliably. Reconciliation must treat the DB as "unknown provenance" and rebuild tracking from a clean replay on staging.
