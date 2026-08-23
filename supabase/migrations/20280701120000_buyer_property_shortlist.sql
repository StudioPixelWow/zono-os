-- ============================================================================
-- ZONO — Buyer Command Center 5.0: BROKER-CURATED SHORTLIST.
-- ----------------------------------------------------------------------------
-- Automatic matches (match_intelligence_profiles) and a broker-approved
-- selection are NOT the same thing. This is the canonical buyer↔property
-- shortlist the broker hand-picks and sends as the buyer's personal portal.
-- Distinct from customer_property_recommendations (the SEND/feedback ledger):
-- a property is shortlisted first, then sending it records a recommendation row.
-- Additive; org-scoped; one row per (org, buyer, property).
-- ============================================================================

create table if not exists public.buyer_property_shortlist (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  buyer_id     uuid not null references public.buyers(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  state        text not null default 'selected'
                 check (state in ('selected','sent','viewed','liked','rejected','visit_requested')),
  selected_by  uuid,                              -- the broker/user who curated it
  selected_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (org_id, buyer_id, property_id)
);

create index if not exists idx_bps_buyer on public.buyer_property_shortlist (org_id, buyer_id);
create index if not exists idx_bps_property on public.buyer_property_shortlist (org_id, property_id);

alter table public.buyer_property_shortlist enable row level security;

-- Agents see + curate their org's shortlists. Service role (portal feedback,
-- background state updates) bypasses RLS for token-authed writes.
create policy buyer_property_shortlist_select on public.buyer_property_shortlist
  for select to authenticated using (org_id = public.current_org_id());
create policy buyer_property_shortlist_write on public.buyer_property_shortlist
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());

comment on table public.buyer_property_shortlist is
  'Broker-curated buyer↔property selection (the buyer''s personal portal set). Distinct from auto-matches and from the send/feedback recommendation ledger.';
