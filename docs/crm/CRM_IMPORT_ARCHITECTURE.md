# ZONO — CRM Import Architecture

## v1 scope (disclosed explicitly)
Import: **persons/contacts, leads, buyers, sellers, properties, tasks, notes, tags**. NOT in v1: deals (only if the deal model safely supports it), offers, commissions. The UI must state clearly what can/cannot be imported.

## Formats: CSV + XLSX (multi-sheet selection for XLSX).

## Workflow
upload → select/auto-detect entity → choose sheet → inspect headers → **map fields** (save reusable mapping) → **preview** normalized values → **validate** rows → **detect duplicates** → choose duplicate behavior → warnings → confirm → process async (large files) → progress → **row-level results** → **error file** (private) → **import history** → **rollback** (where safe).

## Data model (delivered, additive migration `20261001121000_import_pipeline_additive.sql`)
`import_batches` (id, org, actor, entity_type, source_filename, **file_hash** for idempotency, mapping, duplicate_mode, status, total/valid/invalid/skipped/duplicate rows, created/updated ids, error_file_path, rollback_state, timestamps). `import_rows` (batch, row_index, raw, normalized, outcome, resolved_person_id, errors). `import_mappings` (reusable saved mappings). All RLS org-scoped.

## Validation (delivered + tested)
`src/lib/import/validation.ts` (19 tests): normalizes phone (IL), email, dates (ISO + dd/mm/yyyy, rejects month>12), currency (strips ₪/commas), number, boolean (Hebrew כן/לא), tags, city; **rejects formula cells** (never executed); required-field enforcement; per-row + per-field results so a bad row is reported, not thrown — valid rows still commit (partial-failure).

## Duplicate handling
Each row runs the identity resolver (`resolveIdentity`) against the org's persons → link (exact_high), create (no match), or **review** (conflicting/ambiguous). Duplicate modes: skip_exact / update_blank / update_selected / create_separate / review. **Never silently overwrite.**

## Security
org scope fixed by session (not the file); imported owner refs must resolve inside the org; formulas not executed; file size + MIME + extension validated; temp files expire; error files private; rate-limited; idempotent on `file_hash`.
