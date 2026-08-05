-- ============================================================================
-- ZONO — Notes enrichment (Epic 3 · Part 13, shared notes experience)
-- ----------------------------------------------------------------------------
-- Builds the shared notes experience on the EXISTING public.notes table (created
-- in 20260618090600) — NO second notes model. Additive only:
--   • notes: tags[], mentioned_user_ids[], is_archived, edited_at, edit_count
--   • note_edits: append-only edit history (immutable prior-body snapshots)
-- Org-isolated, agent-writable, mirroring the project's RLS convention
-- (select = same org; insert = same org + has_min_role('agent')). Idempotent.
-- ============================================================================

-- ── 1. Additive columns on the existing notes table ──────────────────────────
alter table public.notes add column if not exists tags               text[]      not null default '{}';
alter table public.notes add column if not exists mentioned_user_ids uuid[]      not null default '{}';
alter table public.notes add column if not exists is_archived        boolean     not null default false;
alter table public.notes add column if not exists edited_at          timestamptz;
alter table public.notes add column if not exists edit_count         integer     not null default 0;

create index if not exists idx_notes_archived on public.notes (org_id, is_archived);
create index if not exists idx_notes_created  on public.notes (org_id, created_at desc);

-- ── 2. Append-only edit history ──────────────────────────────────────────────
create table if not exists public.note_edits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  note_id       uuid not null references public.notes(id) on delete cascade,
  editor_id     uuid references public.users(id) on delete set null,
  previous_body text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_note_edits_note on public.note_edits (org_id, note_id, created_at desc);

-- ── 3. RLS for the new history table (mirror project convention) ─────────────
do $$
begin
  execute 'alter table public.note_edits enable row level security';
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='note_edits_select') then
    create policy note_edits_select on public.note_edits for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='note_edits_insert') then
    create policy note_edits_insert on public.note_edits for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  grant select, insert on public.note_edits to authenticated;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped note_edits RLS (insufficient privilege).';
end $$;
