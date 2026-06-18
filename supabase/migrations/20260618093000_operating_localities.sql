-- ============================================================================
-- ZONO — 0012 · Operating localities (org & user) linked to israel_localities
-- ----------------------------------------------------------------------------
-- Which localities an organization / agent actively works, with optional
-- price + property focus per locality and one "primary" locality. References
-- the canonical public.israel_localities. No neighborhoods.
-- ============================================================================

-- ── organization_operating_localities ───────────────────────────────────────
create table public.organization_operating_localities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  locality_id     uuid not null references public.israel_localities(id) on delete restrict,
  is_primary      boolean not null default false,
  min_price       numeric,
  max_price       numeric,
  min_rooms       numeric,
  max_rooms       numeric,
  property_types  jsonb not null default '[]'::jsonb,
  deal_types      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint org_operating_locality_unique unique (organization_id, locality_id)
);

create index idx_org_op_localities_org on public.organization_operating_localities (organization_id);
create index idx_org_op_localities_locality on public.organization_operating_localities (locality_id);

create trigger trg_org_op_localities_updated_at
  before update on public.organization_operating_localities
  for each row execute function public.set_updated_at();

-- ── user_operating_localities ────────────────────────────────────────────────
create table public.user_operating_localities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  locality_id   uuid not null references public.israel_localities(id) on delete restrict,
  is_primary    boolean not null default false,
  min_price     numeric,
  max_price     numeric,
  min_rooms     numeric,
  max_rooms     numeric,
  property_types jsonb not null default '[]'::jsonb,
  deal_types    jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint user_operating_locality_unique unique (user_id, locality_id)
);

create index idx_user_op_localities_user on public.user_operating_localities (user_id);
create index idx_user_op_localities_locality on public.user_operating_localities (locality_id);

create trigger trg_user_op_localities_updated_at
  before update on public.user_operating_localities
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.organization_operating_localities enable row level security;

create policy "org_op_localities_select" on public.organization_operating_localities
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy "org_op_localities_insert" on public.organization_operating_localities
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

create policy "org_op_localities_update" on public.organization_operating_localities
  for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id());

create policy "org_op_localities_delete" on public.organization_operating_localities
  for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));

alter table public.user_operating_localities enable row level security;

-- A user sees their own; managers+ see their org-mates'.
create policy "user_op_localities_select" on public.user_operating_localities
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = user_operating_localities.user_id
        and u.org_id = public.current_org_id()
        and public.has_min_role('manager')
    )
  );

create policy "user_op_localities_insert" on public.user_operating_localities
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_op_localities_update" on public.user_operating_localities
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_op_localities_delete" on public.user_operating_localities
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.organization_operating_localities to authenticated;
grant select, insert, update, delete on public.user_operating_localities to authenticated;
grant all privileges on public.organization_operating_localities to service_role;
grant all privileges on public.user_operating_localities to service_role;
