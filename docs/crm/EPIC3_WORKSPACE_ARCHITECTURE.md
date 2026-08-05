# Epic 3 — Workspace Architecture

Layering (unchanged, enforced): Presentation (client components) → server actions (`"use server"`) → domain services (`server-only`) → Epic 1/2 services + kernel → Supabase (RLS).

Rules honored by new code:
- No direct client Supabase writes. New `documents/upload.ts` writes to a PRIVATE bucket and returns only a path; all mutations elsewhere go through server actions/services.
- No duplicate transition rules / no second identity, task, timeline, offer, deal or viewing model. New domains (offers, commissions/collections, notes-enrichment, people) either add a genuinely new table (offers/commissions/collections) or build on the existing one (notes, people-as-read-time-identity).
- Append-only histories: `offer_events`, `collection_events`, `note_edits` (plus existing `deal_journeys`, `activity_events`).
- Org isolation via `current_org_id()` RLS on every new table; write=`has_min_role('agent')`, approve/cancel=`has_min_role('manager')`.

New modules: `src/lib/{offers,commissions,notes,people}/*`, `src/app/(app)/{offers,commissions,notes,people,leads}/*`, `src/components/notes/NotesPanel.tsx`. Migrations `20270402..20270405`.
