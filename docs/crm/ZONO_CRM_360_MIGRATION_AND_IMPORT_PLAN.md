# ZONO CRM 360 — Migration & Import Plan

Two distinct needs: (A) an internal **identity/data-model migration** to converge the fragmented person model, and (B) a customer-facing **CRM import pipeline** so agents can migrate off their spreadsheet/Monday board. Both must be additive, previewable, and reversible.

## A. Internal identity migration (additive, non-destructive)

**Goal:** one `persons` entity holding multiple roles without duplicating people, without dropping existing `leads`/`buyers`/`sellers` rows.

**Design:**
- New `persons` (canonical identity: normalized phone/email, name, Israeli ID optional, consent).
- New link tables `person_roles` (person_id → role, role_entity_id) mapping each existing buyer/seller/lead row to a person.
- Resolver (pure, testable) canonicalizes phone (last-9 / +972) + email (lowercase) to cluster existing rows into persons.
- `notes`/`documents`/`activity` gain an optional `person_id` (backfilled from the role row's person), so history converges without losing the per-role links.

**Preview-before-apply (required):** total persons to be created; clusters (which buyer+seller+lead rows merge into one person); **ambiguous clusters** (same name, different phone) held for manual review — never auto-merged; before/after counts; rollback = drop `person_id` columns + `persons`/`person_roles` (original tables untouched). Only high-confidence (matching normalized phone/email) auto-clusters.

**Safety:** additive columns/tables only; existing reads keep working; UI switches to person-centric behind a flag after the backfill + review.

## B. CRM import pipeline (customer-facing) — currently MISSING

**Status:** no CSV/Excel import for CRM entities exists (`csv-parse` is a dependency but imported nowhere; no `import_leads/contacts/properties`, no `import_batches` for CRM; only competitor-broker paste + external-listing scrapers).

**Design (new):**
1. `import_batches` / `import_rows` tables (org-scoped, RLS) with status, error report, rollback token.
2. Upload CSV/Excel → parse (server) → **column mapping** UI (map source columns to person/buyer/seller/property/deal/task fields) → **preview** (first N rows, typed) → **validation** (required fields, formats, phone/email normalization) → **duplicate detection** (against existing persons via the resolver) → **commit** (transactional per batch) → **partial-failure report** (invalid rows listed, valid rows committed) → **import history** + **rollback** (undo a batch).
3. Idempotency: a batch is committed once; re-upload detected by content hash.

**Entities for v1 import (product decision):** persons/contacts, buyers, sellers, properties, tasks. Deals + offers later.

**Acceptance:** valid import persists and appears in lists/search/timeline; invalid rows reported without aborting the batch; duplicates flagged (merge or skip); a batch can be rolled back to pre-import state; import history auditable.

**Tests:** valid-file commit; mixed valid/invalid partial-failure; duplicate detection; rollback restores state; large-file performance; RTL/Hebrew + Israeli phone formats.

## Migration safety rules (both A and B)
Additive only; generate a preview with counts + ambiguous list before any write; never merge distinct identities on string similarity; reversible (documented rollback); run inside a transaction; feature-flag the person-centric UI switch; preserve tenant isolation + RLS on all new tables.
