-- ============================================================================
-- ZONO — Creative DNA System (reference-ad library → Style DNA → generation).
-- ----------------------------------------------------------------------------
-- A per-org library of CreativeDNA profiles. Agents upload reference ads they
-- like; Vision analysis aggregates them into a reusable Style DNA (prompt block
-- + rules) that steers ad generation — extracting STYLE PRINCIPLES only, never
-- copying any specific ad / competitor logo 1:1.
-- Conventions (match existing migrations):
--   • org_id uuid -> public.organizations(id) on every table (org isolation)
--   • public.set_updated_at() updated_at trigger
--   • RLS: SELECT = same org; INSERT/UPDATE/DELETE = same org + has_min_role('agent')
--   • grants to authenticated + service_role
-- The 6 named "default" profiles are product PRESETS in code (prompts.ts), not
-- rows here — these tables hold USER-created custom profiles + their assets.
-- ============================================================================

-- ── 1. creative_dna_profiles ──────────────────────────────────────────────────
create table public.creative_dna_profiles (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  agent_id                  uuid references public.users(id) on delete set null,
  office_id                 uuid references public.organizations(id) on delete set null,
  name                      text not null,
  description               text,
  style_type                text not null default 'custom',   -- custom | office | agent | preset
  status                    text not null default 'draft',     -- draft | analyzing | ready | error
  is_default                boolean not null default false,
  analysis_summary          text,
  style_prompt              text,
  negative_prompt           text,
  color_palette             jsonb not null default '[]'::jsonb,
  typography_rules          jsonb not null default '{}'::jsonb,
  layout_rules              jsonb not null default '{}'::jsonb,
  hierarchy_rules           jsonb not null default '{}'::jsonb,
  icon_rules                jsonb not null default '{}'::jsonb,
  agent_positioning_rules   jsonb not null default '{}'::jsonb,
  logo_rules                jsonb not null default '{}'::jsonb,
  image_usage_rules         jsonb not null default '{}'::jsonb,
  created_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index creative_dna_profiles_org_idx     on public.creative_dna_profiles(org_id);
create index creative_dna_profiles_agent_idx    on public.creative_dna_profiles(agent_id);
create index creative_dna_profiles_status_idx   on public.creative_dna_profiles(org_id, status);
create index creative_dna_profiles_default_idx  on public.creative_dna_profiles(org_id, is_default);
create index creative_dna_profiles_created_idx  on public.creative_dna_profiles(org_id, created_at desc);

-- ── 2. creative_reference_assets ──────────────────────────────────────────────
create table public.creative_reference_assets (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  creative_dna_profile_id  uuid not null references public.creative_dna_profiles(id) on delete cascade,
  storage_path             text not null,
  file_name                text,
  mime_type                text,
  width                    integer,
  height                   integer,
  source_type              text not null default 'upload',     -- upload | url | preset
  source_note              text,
  analysis_status          text not null default 'pending',    -- pending | analyzing | done | error
  analysis_json            jsonb not null default '{}'::jsonb,
  extracted_text           text,
  dominant_colors          jsonb not null default '[]'::jsonb,
  detected_layout          text,
  score                    numeric(6,2),
  created_at               timestamptz not null default now()
);
create index creative_reference_assets_org_idx      on public.creative_reference_assets(org_id);
create index creative_reference_assets_profile_idx  on public.creative_reference_assets(creative_dna_profile_id);
create index creative_reference_assets_status_idx   on public.creative_reference_assets(org_id, analysis_status);
create index creative_reference_assets_created_idx  on public.creative_reference_assets(creative_dna_profile_id, created_at desc);

-- ── 3. creative_dna_analysis_runs ─────────────────────────────────────────────
create table public.creative_dna_analysis_runs (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  creative_dna_profile_id  uuid not null references public.creative_dna_profiles(id) on delete cascade,
  status                   text not null default 'pending',    -- pending | running | done | error
  input_asset_count        integer not null default 0,
  output_summary           text,
  output_style_prompt      text,
  output_json              jsonb not null default '{}'::jsonb,
  error_message            text,
  created_at               timestamptz not null default now(),
  completed_at             timestamptz
);
create index creative_dna_analysis_runs_org_idx      on public.creative_dna_analysis_runs(org_id);
create index creative_dna_analysis_runs_profile_idx  on public.creative_dna_analysis_runs(creative_dna_profile_id);
create index creative_dna_analysis_runs_status_idx   on public.creative_dna_analysis_runs(org_id, status);
create index creative_dna_analysis_runs_created_idx  on public.creative_dna_analysis_runs(creative_dna_profile_id, created_at desc);

-- ── 4. creative_generation_references ─────────────────────────────────────────
create table public.creative_generation_references (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  creative_dna_profile_id  uuid references public.creative_dna_profiles(id) on delete set null,
  property_id              uuid references public.properties(id) on delete set null,
  generation_id            uuid,                                -- soft ref (creative_generations / quick output)
  preset_key               text,                                -- when a code PRESET (not a DB profile) was applied
  reference_strength       text not null default 'medium',      -- subtle | medium | strong
  applied_prompt           text,
  applied_rules            jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);
create index creative_generation_references_org_idx      on public.creative_generation_references(org_id);
create index creative_generation_references_profile_idx  on public.creative_generation_references(creative_dna_profile_id);
create index creative_generation_references_created_idx  on public.creative_generation_references(org_id, created_at desc);

-- ── updated_at trigger (profiles only carry updated_at) ───────────────────────
create trigger trg_creative_dna_profiles_updated
  before update on public.creative_dna_profiles
  for each row execute function public.set_updated_at();

-- ── RLS — org isolation; reads = same org, writes = same org + agent role ─────
do $$
declare t text;
begin
  foreach t in array array[
    'creative_dna_profiles','creative_reference_assets',
    'creative_dna_analysis_runs','creative_generation_references'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- ── Storage: creative-references bucket + org-scoped object policies ───────────
-- Path format: orgs/{org_id}/creative-dna/{profile_id}/{asset_id}.{ext}
-- If your Supabase runner lacks access to the storage schema, create the bucket
-- in the dashboard (Storage → New bucket → "creative-references", private) and
-- apply equivalent policies; the rest of the system works regardless.
insert into storage.buckets (id, name, public)
values ('creative-references', 'creative-references', false)
on conflict (id) do nothing;

do $$
begin
  -- org-scoped read/write: the first path segment is "orgs", the second is the org id.
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='creative_refs_select') then
    create policy "creative_refs_select" on storage.objects for select to authenticated
      using (bucket_id = 'creative-references' and (storage.foldername(name))[2] = public.current_org_id()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='creative_refs_insert') then
    create policy "creative_refs_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'creative-references' and (storage.foldername(name))[2] = public.current_org_id()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='creative_refs_delete') then
    create policy "creative_refs_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'creative-references' and (storage.foldername(name))[2] = public.current_org_id()::text);
  end if;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped storage.objects policies (insufficient privilege) — create them in the Supabase dashboard.';
end $$;
