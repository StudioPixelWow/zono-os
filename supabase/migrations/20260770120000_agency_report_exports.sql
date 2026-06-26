-- ============================================================================
-- ZONO — PHASE 26.15: Report Export + Client Presentation™
-- One row per agency-intelligence report export (single agency / competitor
-- overview / territory / opportunity). Tracks status + file_url + provenance.
-- Additive + idempotent. Org column: organization_id. RLS via current_org_id().
-- ============================================================================

create table if not exists public.agency_report_exports (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agency_id         uuid references public.agencies(id) on delete set null,
  export_type       text not null,            -- single_agency_report|competitor_overview|territory_report|opportunity_report
  status            text not null default 'pending',  -- pending|generating|completed|failed
  file_url          text,
  requested_by      uuid references public.users(id) on delete set null,
  requested_at      timestamptz not null default now(),
  generated_at      timestamptz,
  metadata          jsonb not null default '{}'::jsonb,  -- { filters, data_confidence, missing_data, ... }
  error_message     text,
  created_at        timestamptz not null default now()
);

create index if not exists agency_report_exports_org_idx     on public.agency_report_exports(organization_id);
create index if not exists agency_report_exports_agency_idx  on public.agency_report_exports(organization_id, agency_id);
create index if not exists agency_report_exports_type_idx    on public.agency_report_exports(organization_id, export_type);
create index if not exists agency_report_exports_recent_idx  on public.agency_report_exports(organization_id, requested_at desc);

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_report_exports enable row level security;';

  execute 'drop policy if exists agency_report_exports_select on public.agency_report_exports;';
  execute 'create policy agency_report_exports_select on public.agency_report_exports for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_report_exports_insert on public.agency_report_exports;';
  execute 'create policy agency_report_exports_insert on public.agency_report_exports for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_report_exports_update on public.agency_report_exports;';
  execute 'create policy agency_report_exports_update on public.agency_report_exports for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_report_exports_delete on public.agency_report_exports;';
  execute 'create policy agency_report_exports_delete on public.agency_report_exports for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_report_exports to authenticated;';
  execute 'grant all privileges on public.agency_report_exports to service_role;';
end $$;
