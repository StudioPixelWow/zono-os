-- ============================================================================
-- ZONO — Offers & Negotiation domain (Epic 3 · Part 10)
-- ----------------------------------------------------------------------------
-- A real offer entity with an APPEND-ONLY negotiation trail. Offers link a buyer,
-- seller and property; an accepted offer converts into the EXISTING canonical
-- `deals` table (no new deal engine). Historical amounts/terms are NEVER
-- overwritten — every change is a new immutable row in offer_events.
-- Conventions: org_id -> organizations; set_updated_at trigger; RLS select=same
-- org, write=same org + has_min_role('agent'); offer_events is insert-only.
-- ============================================================================

-- ── 1. offers ────────────────────────────────────────────────────────────────
create table if not exists public.offers (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  owner_id             uuid references public.users(id) on delete set null,
  property_id          uuid references public.properties(id) on delete set null,
  buyer_id             uuid references public.buyers(id) on delete set null,
  seller_id            uuid references public.sellers(id) on delete set null,
  match_id             uuid,
  deal_id              uuid references public.deals(id) on delete set null,
  status               text not null default 'draft'
                         check (status in ('draft','submitted','countered','accepted','rejected','withdrawn','expired')),
  current_responder    text check (current_responder in ('buyer','seller')),
  original_amount      integer check (original_amount is null or original_amount >= 0),
  amount               integer check (amount is null or amount >= 0),
  currency             text not null default 'ILS',
  financing            text,
  conditions           text,
  included_items       text,
  requested_entry_date date,
  expires_at           timestamptz,
  note                 text,
  submitted_at         timestamptz,
  closed_at            timestamptz,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_offers_org       on public.offers (org_id);
create index if not exists idx_offers_org_status on public.offers (org_id, status);
create index if not exists idx_offers_property   on public.offers (property_id);
create index if not exists idx_offers_buyer      on public.offers (buyer_id);
create index if not exists idx_offers_deal       on public.offers (deal_id);

create trigger trg_offers_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- ── 2. offer_events (append-only negotiation trail) ──────────────────────────
create table if not exists public.offer_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  offer_id    uuid not null references public.offers(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  actor_side  text check (actor_side in ('buyer','seller','agent')),
  event_type  text not null
                check (event_type in ('created','submitted','countered','seller_response','accepted','rejected','withdrawn','expired','converted_to_deal')),
  amount      integer check (amount is null or amount >= 0),
  terms       jsonb not null default '{}'::jsonb,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_offer_events_offer on public.offer_events (org_id, offer_id, created_at asc);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
do $$
begin
  execute 'alter table public.offers enable row level security';
  execute 'alter table public.offer_events enable row level security';

  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offers_select') then
    create policy offers_select on public.offers for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offers_insert') then
    create policy offers_insert on public.offers for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offers_update') then
    create policy offers_update on public.offers for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offers_delete') then
    create policy offers_delete on public.offers for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;

  -- offer_events: readable in-org, insert-only (append-only trail; no update/delete).
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offer_events_select') then
    create policy offer_events_select on public.offer_events for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='offer_events_insert') then
    create policy offer_events_insert on public.offer_events for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;

  grant select, insert, update, delete on public.offers to authenticated;
  grant select, insert on public.offer_events to authenticated;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped offers RLS (insufficient privilege).';
end $$;
