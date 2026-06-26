-- ============================================================================
-- ZONO — PHASE 26.14: Compliance + Data Governance Layer™
-- ----------------------------------------------------------------------------
-- Three additive tables that make agency intelligence safe + auditable:
--   agency_intelligence_sources    — provenance/confidence/visibility/retention
--   agency_intelligence_audit_log  — append-only who/when/old/new/reason
--   agency_intelligence_policies   — per-org governance policy values
-- Additive + idempotent. Org column: organization_id. RLS via current_org_id()
-- + has_min_role(). No external scraping, no mock data.
-- ============================================================================

-- ── Sources (traceability) ───────────────────────────────────────────────────
create table if not exists public.agency_intelligence_sources (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  entity_type        text not null,                 -- agency|agency_match|agency_score|agency_signal|report|territory_stat|rain_node|rain_edge|copilot_answer
  entity_id          text not null,
  source_type        text not null default 'internal',  -- internal|imported|public|calculated|manual_review|ai_generated
  source_name        text,
  source_url         text,
  collected_at       timestamptz,
  last_verified_at   timestamptz,
  confidence         numeric,                       -- 0..1 (null when unknown — never a fake 0)
  license_status     text not null default 'unknown',   -- unknown|public|licensed|restricted
  visibility_status  text not null default 'visible',   -- visible|limited|needs_review|hidden|expired
  retention_until    timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, source_type, source_name)
);
create index if not exists agency_intel_sources_org_idx     on public.agency_intelligence_sources(organization_id);
create index if not exists agency_intel_sources_entity_idx  on public.agency_intelligence_sources(organization_id, entity_type, entity_id);
create index if not exists agency_intel_sources_vis_idx     on public.agency_intelligence_sources(organization_id, visibility_status);
create index if not exists agency_intel_sources_ret_idx     on public.agency_intelligence_sources(organization_id, retention_until);

-- ── Audit log (append-only) ──────────────────────────────────────────────────
create table if not exists public.agency_intelligence_audit_log (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  actor_id           uuid references public.users(id) on delete set null,
  action             text not null,
  entity_type        text not null,
  entity_id          text,
  old_value          jsonb,
  new_value          jsonb,
  reason             text,
  created_at         timestamptz not null default now()
);
create index if not exists agency_intel_audit_org_idx     on public.agency_intelligence_audit_log(organization_id);
create index if not exists agency_intel_audit_action_idx  on public.agency_intelligence_audit_log(organization_id, action);
create index if not exists agency_intel_audit_entity_idx  on public.agency_intelligence_audit_log(organization_id, entity_type, entity_id);
create index if not exists agency_intel_audit_recent_idx  on public.agency_intelligence_audit_log(organization_id, created_at desc);

-- ── Policies ─────────────────────────────────────────────────────────────────
create table if not exists public.agency_intelligence_policies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  policy_key         text not null,
  policy_value       jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, policy_key)
);
create index if not exists agency_intel_policies_org_idx on public.agency_intelligence_policies(organization_id);

-- ── updated_at trigger (policies) ────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (select 1 from pg_trigger where tgname = 'trg_agency_intel_policies_updated') then
    execute 'create trigger trg_agency_intel_policies_updated before update on public.agency_intelligence_policies for each row execute function public.set_updated_at();';
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['agency_intelligence_sources','agency_intelligence_audit_log','agency_intelligence_policies']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (organization_id = public.current_org_id());', t, t);
    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t, t);
    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t, t);
    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
