-- ============================================================================
-- ZONO — Agent Brand Identity & Design Profile OS
-- ----------------------------------------------------------------------------
-- The master branding source of truth for the whole ZONO ecosystem. One
-- brand_identity_profiles row per entity (agent user / office org) + a
-- brand_assets table for logos/signatures/covers. Office defines a brand;
-- agents inherit unless override is allowed. org-scoped RLS. Extends — does
-- not rebuild — existing user settings.
-- ============================================================================
create table public.brand_identity_profiles (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  entity_type             text not null,
  entity_id               uuid not null,
  -- Part 1 — profile
  full_name                text,
  display_name             text,
  title                    text,
  short_bio                text,
  phone                    text,
  whatsapp                 text,
  email                    text,
  office_name              text,
  years_experience         integer,
  service_areas            jsonb not null default '[]'::jsonb,
  specialties              jsonb not null default '[]'::jsonb,
  languages                jsonb not null default '[]'::jsonb,
  profile_visibility       text not null default 'public',
  -- Part 2 — agent image
  profile_image_url        text,
  profile_image_thumb      text,
  profile_image_status     text not null default 'none',
  -- Part 3 — office logo
  logo_url                 text,
  logo_dark_url            text,
  logo_light_url           text,
  logo_transparent_url     text,
  logo_type                text,
  logo_status              text not null default 'none',
  -- Part 4 — brand colors
  brand_primary            text,
  brand_secondary          text,
  brand_accent             text,
  brand_palette            jsonb not null default '[]'::jsonb,
  color_confidence_score   integer not null default 0 check (color_confidence_score between 0 and 100),
  colors_source            text not null default 'none',
  -- Part 6 — brand style/tone
  brand_style              text,
  brand_tone               text,
  -- Part 9 — content generation profile
  writing_style            text,
  communication_tone       text,
  brand_personality        text,
  target_audience          text,
  preferred_cta_style      text,
  preferred_design_language text,
  preferred_post_style     text,
  -- Part 10 — AI design profile
  ai_design_profile        jsonb not null default '{}'::jsonb,
  -- Part 11 — office override / inheritance
  inherit_brand_settings   boolean not null default true,
  allow_agent_override     boolean not null default true,
  -- Part 12 — completion
  completion_score         integer not null default 0 check (completion_score between 0 and 100),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint brand_identity_entity_uniq unique (entity_type, entity_id)
);
create index brand_identity_org_idx    on public.brand_identity_profiles(org_id);
create index brand_identity_entity_idx on public.brand_identity_profiles(entity_type, entity_id);

create table public.brand_assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  entity_type   text not null,
  entity_id     uuid not null,
  asset_kind    text not null,
  url           text not null,
  storage_path  text,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index brand_assets_org_idx    on public.brand_assets(org_id);
create index brand_assets_entity_idx on public.brand_assets(entity_type, entity_id);
create index brand_assets_kind_idx   on public.brand_assets(asset_kind);

create trigger trg_brand_identity_updated before update on public.brand_identity_profiles for each row execute function public.set_updated_at();
create trigger trg_brand_assets_updated before update on public.brand_assets for each row execute function public.set_updated_at();

do $$
declare t text;
  tbls text[] := array['brand_identity_profiles','brand_assets'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on public.brand_identity_profiles, public.brand_assets to authenticated;
grant all privileges on public.brand_identity_profiles, public.brand_assets to service_role;
