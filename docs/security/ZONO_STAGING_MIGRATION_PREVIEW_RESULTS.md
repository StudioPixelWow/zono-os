# ZONO — Staging Migration Preview Results

## Status: NOT RUN (no staging DB). Production was NOT queried for these previews.
The migrations are additive and their objects are enumerable statically; the ROW-LEVEL preview numbers (affected/ambiguous/orphan/unscoped) require executing preview queries against a staging copy with representative data.

## Objects each migration would create (static)
- **persons_identity_additive:** tables persons, person_identifiers, person_roles, person_merge_log; nullable person_id on leads/buyers/sellers; 5 indexes; RLS + org-scoped select policies. Existing tables affected: leads/buyers/sellers (additive column only). Auto-merge: NONE.
- **import_pipeline_additive:** tables import_batches, import_rows, import_mappings; 2 indexes; RLS policies. No existing table touched.
- **tier1_rls_hardening:** enables RLS + `zono_tenant_select` on up to 22 Tier-1 tables (idempotent). No data change.
- **private_document_buckets:** flips 3 buckets private; drops public-read; adds org-scoped read/write. ⚠️ apply only after signed-URL path deployed.

## Preview queries to run ON STAGING (ready)
- persons backfill: `select count(*) from (buyers ∪ sellers ∪ leads)`; clusters by normalized phone/email; ambiguous (name-only/conflicting) count.
- unscoped rows: per Tier-1 table `select count(*) where organization_id is null`.
- storage: `select bucket_id,count(*) from storage.objects group by 1`.

## Guarantees held
No legacy identity column dropped; no FK rewritten; no identity auto-merged; no public file deleted; no file URL overwritten; no production-derived data rewritten in place.
