-- ============================================================================
-- ZONO — 0023 · Property Source, Ownership & Priority taxonomy
-- ----------------------------------------------------------------------------
-- Distinguishes property origin / ownership / exclusivity / deal priority so
-- internal CRM inventory and external listings never blur together.
-- All columns nullable/defaulted (non-breaking). Backfill maps existing rows.
-- ============================================================================

alter table public.properties
  add column if not exists property_origin              text not null default 'agent_uploaded',
  add column if not exists source_type                  text not null default 'internal',
  add column if not exists external_source              text,
  add column if not exists ownership_scope              text not null default 'agent',
  add column if not exists exclusivity_scope            text not null default 'none',
  add column if not exists listing_rights               text not null default 'full_marketing_rights',
  add column if not exists uploaded_by_user_id          uuid references public.users(id) on delete set null,
  add column if not exists assigned_agent_id            uuid references public.users(id) on delete set null,
  add column if not exists office_owner_id              uuid references public.users(id) on delete set null,
  add column if not exists source_listing_id            text,
  add column if not exists source_listing_url           text,
  add column if not exists source_last_synced_at        timestamptz,
  add column if not exists source_status                text,
  add column if not exists is_internal_inventory        boolean not null default true,
  add column if not exists is_external_inventory        boolean not null default false,
  add column if not exists is_exclusive                 boolean not null default false,
  add column if not exists is_office_exclusive          boolean not null default false,
  add column if not exists is_agent_exclusive           boolean not null default false,
  add column if not exists deal_priority_score          integer not null default 0,
  add column if not exists internal_double_side_priority boolean not null default false,
  add column if not exists source_metadata              jsonb not null default '{}'::jsonb;

create index if not exists properties_origin_idx        on public.properties(property_origin);
create index if not exists properties_source_type_idx    on public.properties(source_type);
create index if not exists properties_assigned_idx        on public.properties(assigned_agent_id);
create index if not exists properties_exclusivity_idx     on public.properties(exclusivity_scope);
create index if not exists properties_priority_idx        on public.properties(deal_priority_score desc);

-- Backfill existing rows to a sensible internal-inventory baseline.
update public.properties set
  uploaded_by_user_id = coalesce(uploaded_by_user_id, owner_id),
  assigned_agent_id   = coalesce(assigned_agent_id, owner_id),
  is_exclusive        = has_exclusivity,
  is_agent_exclusive  = has_exclusivity,
  exclusivity_scope   = case when has_exclusivity then 'agent_exclusive' else 'none' end
where source_type = 'internal';
