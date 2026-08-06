-- ============================================================================
-- ZONO — Orphan reconciliation: ADOPT public.journey_notes into the repository.
-- ----------------------------------------------------------------------------
-- Provenance: `journey_notes` existed on the staging database but was defined by
-- NO repository migration (reverse drift discovered during the Repository ⇄
-- Database Final Reconciliation, 2026-08-05). It IS code-referenced —
-- `src/lib/journey-backfill/service.ts` reads it as a backfill source, keyed by
-- (entity_type, entity_id) — so the correct resolution is additive adoption, not
-- a drop. This migration reproduces the EXACT live shape (columns, types,
-- defaults, check, foreign keys, index, RLS, policies) as an idempotent
-- create-if-not-exists, so re-applying it against staging is a no-op and the
-- repository now defines the table it already contains. No destructive change.
-- ============================================================================

create table if not exists public.journey_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('buyer','seller','lead','property')),
  entity_id   uuid not null,
  author_id   uuid references public.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists journey_notes_entity_idx
  on public.journey_notes (org_id, entity_type, entity_id);

do $$
begin
  execute 'alter table public.journey_notes enable row level security';

  drop policy if exists journey_notes_select on public.journey_notes;
  create policy journey_notes_select on public.journey_notes
    for select to authenticated
    using (org_id = public.current_org_id());

  drop policy if exists journey_notes_write on public.journey_notes;
  create policy journey_notes_write on public.journey_notes
    for all to authenticated
    using (org_id = public.current_org_id() and public.has_min_role('agent'))
    with check (org_id = public.current_org_id() and public.has_min_role('agent'));

  grant select, insert, update, delete on public.journey_notes to authenticated;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped journey_notes RLS adoption (insufficient privilege).';
end $$;
