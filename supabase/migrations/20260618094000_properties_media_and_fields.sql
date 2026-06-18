-- ============================================================================
-- ZONO — 0013 · Property listing builder: media table + extended fields
-- ----------------------------------------------------------------------------
-- Adds everything the premium "create property" wizard needs: geo + address
-- display flags, extended features, marketing/AI fields, quality score,
-- publishing fields, the property_media table, and two new status values.
-- ============================================================================

-- ── New enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type listing_tag as enum ('new', 'exclusive', 'opportunity', 'premium', 'sold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_type as enum ('image', 'video', 'floor_plan', 'tour_360', 'document');
exception when duplicate_object then null; end $$;

-- ── Extend property_status with ready/published (safe; not used in this tx) ───
alter type property_status add value if not exists 'ready';
alter type property_status add value if not exists 'published';

-- ── properties: new columns ───────────────────────────────────────────────────
alter table public.properties
  add column if not exists neighborhood            text,
  add column if not exists building_number         text,
  add column if not exists formatted_address       text,
  add column if not exists latitude                numeric,
  add column if not exists longitude               numeric,
  add column if not exists show_exact_address      boolean not null default true,
  add column if not exists show_neighborhood_only  boolean not null default false,
  add column if not exists parking_count           integer check (parking_count is null or parking_count >= 0),
  add column if not exists storage_count           integer check (storage_count is null or storage_count >= 0),
  add column if not exists balcony_count           integer check (balcony_count is null or balcony_count >= 0),
  add column if not exists features                jsonb not null default '[]'::jsonb,
  add column if not exists listing_tag             listing_tag,
  add column if not exists availability_date       date,
  add column if not exists price_before_discount   integer check (price_before_discount is null or price_before_discount >= 0),
  add column if not exists price_per_sqm           integer check (price_per_sqm is null or price_per_sqm >= 0),
  add column if not exists marketing_description    text,
  add column if not exists ai_description           text,
  add column if not exists internal_notes           text,
  add column if not exists target_audience          text,
  add column if not exists quality_score            smallint check (quality_score between 0 and 100),
  add column if not exists last_ai_generated_at     timestamptz,
  add column if not exists primary_image_url        text,
  add column if not exists published_at             timestamptz;

-- ── property_media ─────────────────────────────────────────────────────────────
create table if not exists public.property_media (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  property_id   uuid not null references public.properties(id) on delete cascade,
  type          media_type not null default 'image',
  url           text not null,
  storage_path  text,
  mime_type     text,
  file_size     bigint check (file_size is null or file_size >= 0),
  width         integer,
  height        integer,
  sort_order    smallint not null default 0,
  is_primary    boolean not null default false,
  alt_text      text,
  external_url  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_property_media_property on public.property_media (property_id, sort_order);
create index if not exists idx_property_media_org on public.property_media (org_id);
-- At most one primary media per property.
create unique index if not exists uq_property_media_primary
  on public.property_media (property_id) where is_primary;

create trigger trg_property_media_updated_at
  before update on public.property_media
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.property_media enable row level security;

create policy "property_media_select" on public.property_media
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "property_media_insert" on public.property_media
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));

create policy "property_media_update" on public.property_media
  for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());

create policy "property_media_delete" on public.property_media
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.property_media to authenticated;
grant all privileges on public.property_media to service_role;
