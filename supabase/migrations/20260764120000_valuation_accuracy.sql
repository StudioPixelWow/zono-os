-- ============================================================================
-- ZONO — VALUATION SELF-LEARNING: valuation_accuracy
-- ----------------------------------------------------------------------------
-- Turns every completed transaction into training data: stores the predicted
-- valuation vs the actual selling price (+ the deal context) and the resulting
-- prediction error, so the engine can learn and report its real accuracy per
-- city. Additive + idempotent. RLS via current_org_id(). Real data only.
-- ============================================================================

create table if not exists public.valuation_accuracy (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  valuation_id           uuid references public.property_valuations(id) on delete set null,
  property_id            uuid references public.properties(id) on delete set null,
  deal_id                uuid references public.deals(id) on delete set null,
  -- context
  city                   text,
  neighborhood           text,
  property_type          text,
  -- prediction vs reality
  predicted_value        numeric,
  actual_value           numeric,
  difference             numeric,        -- actual - predicted
  percentage_error       numeric,        -- signed % vs predicted
  accuracy_percent       numeric,        -- 0..100 (100 - |%error|)
  predicted_ppsqm        numeric,
  actual_ppsqm           numeric,
  -- deal facts
  asking_price           numeric,
  final_price            numeric,
  negotiation_percent    numeric,
  days_on_market         integer,
  showings               integer,
  offers                 integer,
  marketing_channels     jsonb not null default '[]'::jsonb,
  property_features       jsonb not null default '{}'::jsonb,
  market_conditions      jsonb not null default '{}'::jsonb,
  -- provenance
  algorithm_version      text not null default 'avm-v2',
  confidence_at_prediction numeric,
  created_at             timestamptz not null default now()
);

create index if not exists valuation_accuracy_org_idx   on public.valuation_accuracy(organization_id);
create index if not exists valuation_accuracy_city_idx   on public.valuation_accuracy(organization_id, city);
create index if not exists valuation_accuracy_val_idx    on public.valuation_accuracy(valuation_id);
create index if not exists valuation_accuracy_deal_idx   on public.valuation_accuracy(deal_id);
create index if not exists valuation_accuracy_type_idx   on public.valuation_accuracy(organization_id, property_type);

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.valuation_accuracy enable row level security;';

  execute 'drop policy if exists valuation_accuracy_select on public.valuation_accuracy;';
  execute 'create policy valuation_accuracy_select on public.valuation_accuracy for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists valuation_accuracy_insert on public.valuation_accuracy;';
  execute 'create policy valuation_accuracy_insert on public.valuation_accuracy for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists valuation_accuracy_update on public.valuation_accuracy;';
  execute 'create policy valuation_accuracy_update on public.valuation_accuracy for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists valuation_accuracy_delete on public.valuation_accuracy;';
  execute 'create policy valuation_accuracy_delete on public.valuation_accuracy for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.valuation_accuracy to authenticated;';
  execute 'grant all privileges on public.valuation_accuracy to service_role;';
end $$;
