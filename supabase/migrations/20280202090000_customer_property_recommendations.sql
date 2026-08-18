-- ============================================================================
-- ZONO — Buyer/Renter MATCH BUNDLES: recommendation history.
-- ----------------------------------------------------------------------------
-- The stable per-(contact, property) recommendation ledger. It powers three
-- mandatory guarantees + one future feature:
--   • NEVER recommend the same property to the same contact twice
--     (unique(org, contact_type, contact_id, property_id))
--   • carry customer feedback back into the CRM (status: viewed/interested/
--     rejected/viewing_requested)
--   • let the agent see exactly what was sent, when, on which channel
--   • price_at_send lets Slice 3 send "a property you liked dropped in price"
--     without rebuilding the relationship model.
-- Additive; reuses notification_deliveries for transport dedup/logging.
-- ============================================================================

create table if not exists public.customer_property_recommendations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  contact_type     text not null check (contact_type in ('buyer','lead')),
  contact_id       uuid not null,
  property_id      uuid not null references public.properties(id) on delete cascade,
  bundle_id        uuid not null,                 -- groups one send
  channel          text not null check (channel in ('email','whatsapp')),
  status           text not null default 'recommended'
                     check (status in ('recommended','viewed','interested','rejected','viewing_requested')),
  match_score      smallint,                      -- compatibility at send (explainability)
  price_at_send    integer,                       -- for Slice 3 price-drop reuse
  rejection_reason text,
  recommended_at   timestamptz not null default now(),
  responded_at     timestamptz,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (org_id, contact_type, contact_id, property_id)
);

create index if not exists idx_cpr_contact on public.customer_property_recommendations (org_id, contact_type, contact_id);
create index if not exists idx_cpr_bundle  on public.customer_property_recommendations (bundle_id);

alter table public.customer_property_recommendations enable row level security;

-- Agents see their org's recommendation history (agent visibility). Service role
-- (cron sends, token-authed customer feedback) bypasses RLS for background writes.
create policy customer_property_recommendations_select on public.customer_property_recommendations
  for select to authenticated using (org_id = public.current_org_id());
create policy customer_property_recommendations_write on public.customer_property_recommendations
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());
