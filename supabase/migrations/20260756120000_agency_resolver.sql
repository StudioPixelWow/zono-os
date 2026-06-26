-- ============================================================================
-- ZONO — PHASE 26.1: AI Agency Identity Resolver
-- ----------------------------------------------------------------------------
-- Infrastructure for resolving messy raw agency/broker text into agency
-- entities. Stores every resolution attempt as a candidate (with confidence +
-- evidence) and keeps an alias index for fast de-duplication. Additive +
-- idempotent. Org-scoped RLS. No UI, no scraping.
-- ============================================================================

-- ── agency_aliases ───────────────────────────────────────────────────────────
create table if not exists public.agency_aliases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  alias           text not null,
  normalized_alias text not null,
  source          text,                       -- where the alias came from (auto/manual/import)
  created_at      timestamptz not null default now()
);
create index if not exists agency_aliases_agency_idx on public.agency_aliases(agency_id);
create index if not exists agency_aliases_org_norm_idx on public.agency_aliases(organization_id, normalized_alias);
create unique index if not exists agency_aliases_unique on public.agency_aliases(organization_id, agency_id, normalized_alias);

-- ── agency_resolution_candidates ─────────────────────────────────────────────
create table if not exists public.agency_resolution_candidates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  raw_text        text not null,
  normalized_name text not null default '',
  source          text,                       -- e.g. external_listing / broker / manual
  source_ref      text,                       -- safe reference (e.g. listing id)
  status          text not null default 'pending'
                    check (status in ('pending','accepted','rejected','auto_created','needs_review','enriched')),
  confidence      numeric,
  matched_agency_id uuid references public.agencies(id) on delete set null,
  evidence        jsonb not null default '{}'::jsonb,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists agency_res_org_idx on public.agency_resolution_candidates(organization_id, created_at desc);
create index if not exists agency_res_status_idx on public.agency_resolution_candidates(organization_id, status, created_at desc);
create index if not exists agency_res_norm_idx on public.agency_resolution_candidates(organization_id, normalized_name);

-- ── RLS ──────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['agency_aliases','agency_resolution_candidates'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id());', t || '_select', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t || '_update', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
