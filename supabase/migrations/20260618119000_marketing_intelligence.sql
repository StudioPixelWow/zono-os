-- ============================================================================
-- ZONO — 0036 · Marketing Intelligence OS (the Marketing Brain)
-- ----------------------------------------------------------------------------
-- Decides WHAT/WHERE/TO-WHOM/WHEN/WHY to market — before any publishing system.
-- New data: communities (manual, no Meta/FB/WhatsApp API), community scores,
-- per-property marketing DNA, buyer segments, marketing opportunities.
-- Reuses existing buyers / buyer intelligence / properties / market / graph.
-- Deterministic. No publishing. No LLM. Org-scoped, RLS. Idempotent.
-- ============================================================================

-- 1) community_profiles — manually curated marketing communities/channels.
create table if not exists public.community_profiles (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  platform          text not null default 'facebook',  -- facebook|whatsapp|telegram|linkedin|investors|neighborhood|local
  city              text,
  locality          text,
  audience_type     text not null default 'buyers',     -- buyers|sellers|investors|luxury|families|young|commercial
  members_count     integer not null default 0,
  engagement_score  smallint not null default 0,
  lead_score        smallint not null default 0,
  deal_score        smallint not null default 0,
  roi_score         smallint not null default 0,
  trust_score       smallint not null default 0,
  status            text not null default 'active',      -- active|inactive
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists community_profiles_org_idx      on public.community_profiles(organization_id);
create index if not exists community_profiles_audience_idx on public.community_profiles(audience_type);
create index if not exists community_profiles_city_idx     on public.community_profiles(city);

-- 2) community_intelligence_profiles — computed scores per community.
create table if not exists public.community_intelligence_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  community_id             uuid not null references public.community_profiles(id) on delete cascade,
  activity_score           smallint not null default 0,
  lead_quality_score       smallint not null default 0,
  deal_generation_score    smallint not null default 0,
  audience_match_score     smallint not null default 0,
  roi_score                smallint not null default 0,
  growth_score             smallint not null default 0,
  community_health_score   smallint not null default 0,
  community_influence_score smallint not null default 0,
  level                    text not null default 'average',  -- elite|strong|average|weak|dead
  ai_summary               text,
  last_calculated_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint community_intelligence_profiles_uniq unique (organization_id, community_id)
);
create index if not exists community_intelligence_profiles_org_idx on public.community_intelligence_profiles(organization_id);

-- 3) property_marketing_profiles — per-property Marketing DNA.
create table if not exists public.property_marketing_profiles (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  property_id                 uuid not null references public.properties(id) on delete cascade,
  target_audience             jsonb not null default '[]'::jsonb,
  buyer_personas              jsonb not null default '[]'::jsonb,
  motivators                  jsonb not null default '[]'::jsonb,
  objections                  jsonb not null default '[]'::jsonb,
  pain_points                 jsonb not null default '[]'::jsonb,
  angles                      jsonb not null default '{}'::jsonb,  -- {lifestyle,investment,family,urgency}
  recommended_channels        jsonb not null default '[]'::jsonb,
  recommended_communities     jsonb not null default '[]'::jsonb,  -- ranked community matches
  recommended_content_types   jsonb not null default '[]'::jsonb,
  recommended_publishing_times jsonb not null default '[]'::jsonb,
  recommended_budget_level    text,
  expected_lead_volume        integer not null default 0,
  expected_conversion         smallint not null default 0,
  marketing_score             smallint not null default 0,
  ai_summary                  text,
  last_calculated_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint property_marketing_profiles_uniq unique (organization_id, property_id)
);
create index if not exists property_marketing_profiles_org_idx   on public.property_marketing_profiles(organization_id);
create index if not exists property_marketing_profiles_score_idx on public.property_marketing_profiles(marketing_score desc);

-- 4) buyer_segments — computed audience segments.
create table if not exists public.buyer_segments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  segment_key         text not null,   -- young_families|luxury|investors|first_home|downsizers|commercial
  label               text not null,
  segment_size        integer not null default 0,
  segment_quality     smallint not null default 0,
  segment_activity    smallint not null default 0,
  segment_conversion  smallint not null default 0,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint buyer_segments_uniq unique (organization_id, segment_key)
);
create index if not exists buyer_segments_org_idx on public.buyer_segments(organization_id);

-- 5) marketing_opportunity_signals.
create table if not exists public.marketing_opportunity_signals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  signal_type       text not null,  -- high_demand_locality|low_inventory_locality|investor_hotspot|luxury_hotspot|family_hotspot|seller_acquisition_hotspot|promotion_opportunity
  entity_type       text,
  entity_id         text,
  title             text not null,
  description       text,
  impact_score      smallint not null default 50,
  confidence_score  smallint not null default 60,
  recommended_action text,
  metadata          jsonb not null default '{}'::jsonb,
  status            text not null default 'open',
  created_at        timestamptz not null default now()
);
create index if not exists marketing_opportunity_signals_org_idx  on public.marketing_opportunity_signals(organization_id);
create index if not exists marketing_opportunity_signals_type_idx on public.marketing_opportunity_signals(signal_type);

-- updated_at triggers
drop trigger if exists trg_community_profiles_updated on public.community_profiles;
create trigger trg_community_profiles_updated before update on public.community_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_community_intelligence_profiles_updated on public.community_intelligence_profiles;
create trigger trg_community_intelligence_profiles_updated before update on public.community_intelligence_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_property_marketing_profiles_updated on public.property_marketing_profiles;
create trigger trg_property_marketing_profiles_updated before update on public.property_marketing_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_buyer_segments_updated on public.buyer_segments;
create trigger trg_buyer_segments_updated before update on public.buyer_segments for each row execute function public.set_updated_at();

-- RLS — org-scoped. Read for all org members; write requires agent+.
do $$
declare t text;
  tbls text[] := array['community_profiles','community_intelligence_profiles','property_marketing_profiles','buyer_segments','marketing_opportunity_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
