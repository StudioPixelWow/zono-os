-- ============================================================================
-- ZONO — 0015 · Property Journey Engine
-- ----------------------------------------------------------------------------
-- Every property gets a lifecycle ("journey") row that tracks its current
-- stage, when that stage was entered, the last activity timestamp (for stalled
-- detection) and a denormalised progress %. A trigger creates a journey for
-- every new property; a backfill creates one for every existing property.
-- The activity feed reuses the existing public.activities table (property_id).
-- ============================================================================

-- 1) Stage enum (ordered: index drives progress %) ---------------------------
create type journey_stage as enum (
  'new',
  'information_collection',
  'marketing_preparation',
  'published',
  'active_marketing',
  'negotiation',
  'deal_signed',
  'closed'
);

-- 2) Journey table (1:1 with properties) -------------------------------------
create table public.property_journeys (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  property_id       uuid not null unique references public.properties(id) on delete cascade,
  current_stage     journey_stage not null default 'new',
  stage_entered_at  timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  progress          smallint not null default 0 check (progress between 0 and 100),
  stage_history     jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index property_journeys_org_idx       on public.property_journeys(org_id);
create index property_journeys_stage_idx      on public.property_journeys(current_stage);
create index property_journeys_activity_idx   on public.property_journeys(last_activity_at desc);

create trigger trg_property_journeys_updated
  before update on public.property_journeys
  for each row execute function public.set_updated_at();

-- 3) Map a property.status to a sensible starting journey stage --------------
create or replace function public.journey_stage_for_status(p_status property_status)
returns journey_stage
language sql immutable
as $$
  select case p_status
    when 'draft'       then 'new'
    when 'active'      then 'active_marketing'
    when 'published'   then 'published'
    when 'ready'       then 'marketing_preparation'
    when 'under_offer' then 'negotiation'
    when 'in_contract' then 'deal_signed'
    when 'sold'        then 'closed'
    when 'rented'      then 'closed'
    when 'withdrawn'   then 'closed'
    when 'archived'    then 'closed'
    else 'new'
  end::journey_stage;
$$;

-- progress % from the stage's ordinal position (0..7 → 0..100)
create or replace function public.journey_progress_for_stage(p_stage journey_stage)
returns smallint
language sql immutable
as $$
  select round((array_position(
    enum_range(null::journey_stage), p_stage) - 1) * 100.0 / 7.0)::smallint;
$$;

-- 4) Auto-create a journey whenever a property is inserted -------------------
-- SECURITY DEFINER so it succeeds for both RLS-scoped and service-role inserts.
create or replace function public.create_property_journey()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.property_journeys (org_id, property_id, current_stage, progress)
  values (
    new.org_id,
    new.id,
    public.journey_stage_for_status(new.status),
    public.journey_progress_for_stage(public.journey_stage_for_status(new.status))
  )
  on conflict (property_id) do nothing;
  return new;
end;
$$;

create trigger trg_create_property_journey
  after insert on public.properties
  for each row execute function public.create_property_journey();

-- 5) Backfill journeys for every existing property ---------------------------
insert into public.property_journeys (org_id, property_id, current_stage, progress)
select p.org_id,
       p.id,
       public.journey_stage_for_status(p.status),
       public.journey_progress_for_stage(public.journey_stage_for_status(p.status))
from public.properties p
where not exists (
  select 1 from public.property_journeys j where j.property_id = p.id
);

-- 6) RLS — same org model as the rest of the schema --------------------------
alter table public.property_journeys enable row level security;

create policy "property_journeys_select" on public.property_journeys
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "property_journeys_insert" on public.property_journeys
  for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));

create policy "property_journeys_update" on public.property_journeys
  for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());

create policy "property_journeys_delete" on public.property_journeys
  for delete to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('manager'));

grant select, insert, update, delete on public.property_journeys to authenticated;
grant all privileges on public.property_journeys to service_role;
