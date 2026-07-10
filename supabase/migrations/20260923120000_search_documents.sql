-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.1 · Canonical Search Projection
-- ----------------------------------------------------------------------------
-- ONE canonical, event-driven search projection every major entity feeds into.
-- We do NOT build a second command palette and we do NOT replace the existing
-- Command Center UI — this is the read model the global search will cut over to
-- (Batch 4.2). The Event Kernel search subscriber upserts/soft-deletes rows here;
-- a backfill seeds history. Legacy live multi-table search stays as fallback.
--
-- SAFETY: normalized_text/keywords carry ONLY broadly-searchable, non-sensitive
-- text (titles, city, status, public identifiers, normalized phone). Private
-- notes, raw legal document text, tokens, webhook payloads and signing secrets
-- are NEVER indexed (enforced in the pure document builder, not here).
-- Org column: organization_id. RLS org-scoped read; writes are service-role.
-- ============================================================================

create extension if not exists pg_trgm;

create table if not exists public.search_documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  entity_type       text not null,
  entity_id         text not null,              -- text: supports non-uuid subjects (external_listing…)
  title             text not null,
  subtitle          text,
  normalized_text   text not null default '',   -- fuzzy/full-text haystack (safe fields only)
  keywords          text[] not null default '{}',
  route             text not null,              -- real in-app route to open the entity
  owner_user_id     uuid references public.users(id) on delete set null,
  visibility        text not null default 'internal',
  metadata          jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,                -- when the source entity last changed
  indexed_at        timestamptz not null default now(),
  deleted_at        timestamptz,                -- soft-delete (archive/remove) — hidden from search
  event_id          uuid,                       -- last domain event that (re)indexed it
  constraint search_documents_uniq unique (organization_id, entity_type, entity_id),
  constraint search_documents_visibility_chk check (visibility in ('internal','private','shared','public'))
);

-- Lookup + filter indexes.
create index if not exists search_documents_org_idx        on public.search_documents (organization_id);
create index if not exists search_documents_org_type_idx   on public.search_documents (organization_id, entity_type);
create index if not exists search_documents_entity_idx     on public.search_documents (entity_type, entity_id);
create index if not exists search_documents_owner_idx      on public.search_documents (organization_id, owner_user_id);
create index if not exists search_documents_updated_idx    on public.search_documents (organization_id, source_updated_at desc);
-- Fuzzy (Hebrew-friendly) + full-text over the safe haystack. Only live rows.
create index if not exists search_documents_trgm_idx
  on public.search_documents using gin (normalized_text gin_trgm_ops);
create index if not exists search_documents_fts_idx
  on public.search_documents using gin (to_tsvector('simple', normalized_text));

alter table public.search_documents enable row level security;

drop policy if exists "search_documents_select" on public.search_documents;
create policy "search_documents_select" on public.search_documents for select to authenticated
  using (organization_id = public.current_org_id());
-- Writes are service-role only (kernel search subscriber + backfill).

grant select on public.search_documents to authenticated;
grant all privileges on public.search_documents to service_role;
