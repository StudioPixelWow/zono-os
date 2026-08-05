# Staging Deployment Checklist (Phase 5/6 execution)

Pre
- [ ] Create dedicated staging Supabase project (isolated DB/storage/auth; NOT production; not zono-dev).
- [ ] Confirm staging ref ≠ production ref; document both.
- [ ] Disable outbound comms (email/WhatsApp/Meta) in staging config.
- [ ] Set staging env for the app (URL, anon/service keys) — never reuse production service-role key.

Replay
- [ ] `supabase db reset` on empty staging.
- [ ] Apply all 214 migrations in canonical order; capture per-file result.
- [ ] Verify `schema_migrations` = 214 and repo↔staging schema diff is empty.

Schema verify (SQL — expect all present)
- [ ] Tables exist: offers, offer_events, commissions, collections, collection_events, note_edits (+ notes.tags/mentioned_user_ids/is_archived/edited_at/edit_count).
- [ ] Meta 6.9 tables exist (meta_publish_job, meta_inbox_conversation, meta_object_insight, …).
- [ ] RLS enabled + policies on every new table; `org_id` present; append-only tables (offer_events/collection_events/note_edits) have insert-only policy (no update/delete).
- [ ] Triggers `trg_*_updated_at` on tables with updated_at.
- [ ] Indexes on org_id + hot FKs for new tables.

Storage verify
- [ ] `documents` bucket public=false; org SELECT policy present; property-media stays public.

Runtime verify (app on staging) — see RUNTIME_DEPLOYMENT_VERIFICATION.

Promote (production)
- [ ] DB backup + restore point recorded.
- [ ] Apply the 77-table + notes-column + documents-private delta in canonical order (idempotent).
- [ ] Re-run schema + storage verify against production.
- [ ] Rotate exposed keys.
