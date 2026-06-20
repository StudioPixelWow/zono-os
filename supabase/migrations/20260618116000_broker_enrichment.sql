-- ============================================================================
-- ZONO — 0033 · Broker & Competitor Intelligence — Enrichment + Logo Layer
-- ----------------------------------------------------------------------------
-- EXTENDS the existing broker layer (broker_profiles / property_broker_matches)
-- with public-enrichment + logo fields, adds broker_logo_assets, and an org-
-- level switch to disable external enrichment. Purely additive — nothing is
-- removed or renamed. Org-scoped, RLS-protected. Idempotent.
-- ============================================================================

-- 1) broker_profiles — enrichment + logo + social columns.
alter table public.broker_profiles
  add column if not exists logo_url            text,
  add column if not exists logo_storage_path   text,
  add column if not exists logo_hash           text,
  add column if not exists logo_embedding      jsonb,
  add column if not exists brand_colors        jsonb not null default '[]'::jsonb,
  add column if not exists region              text,
  add column if not exists emails              jsonb not null default '[]'::jsonb,
  add column if not exists google_business_url text,
  add column if not exists facebook_url        text,
  add column if not exists instagram_url       text,
  add column if not exists linkedin_url        text,
  add column if not exists enrichment_status   text not null default 'none',  -- none|pending|enriched|needs_review|failed
  add column if not exists last_enriched_at    timestamptz;

-- 2) property_broker_matches — exclusivity + competitor flags.
alter table public.property_broker_matches
  add column if not exists is_exclusive_probability smallint not null default 0,
  add column if not exists is_competitor_listing    boolean  not null default false;

-- 3) organizations — switch to disable external enrichment (default OFF / safe).
alter table public.organizations
  add column if not exists broker_enrichment_enabled boolean not null default false;

-- 4) broker_logo_assets — multiple logo versions per agency, with hash/embedding.
create table if not exists public.broker_logo_assets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  broker_id        uuid not null references public.broker_profiles(id) on delete cascade,
  original_url     text,
  storage_path     text,
  image_hash       text,
  embedding        jsonb,
  width            integer,
  height           integer,
  source           text,            -- website|favicon|social|listing_image|manual_upload
  confidence_score smallint not null default 0,
  status           text not null default 'detected',  -- detected|approved|rejected|manual
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists broker_logo_assets_org_idx    on public.broker_logo_assets(org_id);
create index if not exists broker_logo_assets_broker_idx on public.broker_logo_assets(broker_id);
create index if not exists broker_logo_assets_hash_idx   on public.broker_logo_assets(image_hash);

drop trigger if exists trg_broker_logo_assets_updated on public.broker_logo_assets;
create trigger trg_broker_logo_assets_updated before update on public.broker_logo_assets
  for each row execute function public.set_updated_at();

alter table public.broker_logo_assets enable row level security;
drop policy if exists "broker_logo_assets_select" on public.broker_logo_assets;
create policy "broker_logo_assets_select" on public.broker_logo_assets for select to authenticated
  using (org_id = public.current_org_id());
drop policy if exists "broker_logo_assets_write" on public.broker_logo_assets;
create policy "broker_logo_assets_write" on public.broker_logo_assets for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.broker_logo_assets to authenticated;
grant all privileges on public.broker_logo_assets to service_role;
