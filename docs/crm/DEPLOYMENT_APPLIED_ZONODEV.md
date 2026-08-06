# Deployment Applied — zono-dev (Epic 3 delta)

Executed against the LIVE Supabase project `tlrefajhyrqnjtmimaos` (zono-dev) via the management API, with the owner's explicit approval. Only the 4 self-authored, additive, idempotent Epic 3 migrations were applied (the certified blockers). The unrelated undeployed batches (Meta 6.9, Copilot, ZI, Creative-persistence) were NOT applied — see "Remaining".

## Applied (in canonical order) — all `success: true`
1. `20270404120000_offers` → tables `offers`, `offer_events` (+ indexes, updated_at trigger, RLS).
2. `20270403120000_notes_enrichment` → `notes.{tags,mentioned_user_ids,is_archived,edited_at,edit_count}` + `note_edits` (+ RLS).
3. `20270405120000_commissions_collections` → `commissions`, `collections`, `collection_events` (+ indexes, triggers, RLS).
4. `20270402120000_documents_private_storage` → `documents` bucket → PRIVATE, dropped public-select, added org-scoped `documents_org_select`.

## Runtime verification (post-apply, live)
- 6/6 Epic 3 tables present: offers, offer_events, commissions, collections, collection_events, note_edits.
- 5/5 notes-enrichment columns present.
- `documents` bucket `public = false`; `documents_org_select` policy present.
- RLS enabled on all 6 new tables. Policy counts: offers/commissions/collections = 4 (S/I/U/D); offer_events/collection_events/note_edits = **2 (INSERT/SELECT only)** → append-only enforced at the DB.
- `schema_migrations` count 10 → 14 (the 4 are now tracked).

→ The Epic-3 runtime blocker is CLEARED on zono-dev: /offers, /commissions, /deals detail, notes enrichment, and private document access now have their schema. The documents public-exposure security hole is closed.

## Behavioral note
Flipping `documents` to private means any pre-existing PUBLIC document URLs stop resolving; new access is via server-minted signed URLs, and legacy rows with a stored `file_url` still open via the code's fallback. Regenerate access via the app if any old public links were in use.

## Remaining (NOT applied — needs the staging-first path)
~71 of the original 77 undeployed tables remain: the **Meta Workspace 6.9** batch (~51 tables), **Copilot** (5), **ZI knowledge** (5), **Creative persistence** (3), and misc (7). These migrations were not authored/verified in this session and may not all be idempotent; applying them blindly to a live DB is unsafe. Recommended: clean-replay on a dedicated staging project (DEPLOYMENT_PLAN) before promoting that delta.

## Verdict update
Epic 3 deployment on zono-dev: **applied + verified.** Overall program verdict remains **❌ Deployment Not Ready** until the remaining ~71 undeployed tables are reconciled via staging and the migration pipeline is made reproducible.
