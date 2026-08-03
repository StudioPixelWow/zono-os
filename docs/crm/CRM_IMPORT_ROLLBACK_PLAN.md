# ZONO — CRM Import Rollback Plan

## Which imports are safely reversible
- **create-only batches:** fully reversible — delete the batch-created records IF unchanged since import.
- **controlled updates (update_blank / update_selected):** reversible only where the pre-values were captured in `import_batches.rollback_state`; restore captured values IF the record hasn't changed since.
- **create_separate:** reversible like create-only.

## Rollback rules
- Remove only records **created by that import** and only if unchanged (compare `updated_at`/hash to the import snapshot).
- Restore captured prior values for controlled updates where supported.
- **Refuse unsafe rollback** when records have since changed (report which, do partial rollback, leave the rest).
- Every rollback leaves an audit trail (`import_batches.status='rolled_back'`, `rolled_back_at`, per-row outcome).
- Report **partial rollback** clearly (X reverted, Y skipped because modified).

## Not reversible / blocked
- Rows that triggered downstream side effects already consumed by another workflow (e.g. a lead already converted to a deal) — flagged, not auto-reverted; manual review.

## Data
`import_batches.rollback_state` (jsonb of pre-values), `created_record_ids`, `updated_record_ids`; `import_rows.outcome` per row. RLS org-scoped so a rollback can only touch the importing org.
