-- ============================================================================
-- ZONO — 0031 · Deal Forecast Engine (Predictive Revenue Layer)
-- ----------------------------------------------------------------------------
-- Deterministic, AI-ready revenue forecasting across all intelligence layers.
-- Org-scoped. Managers see org-wide; agents see their own forecasts.
-- ============================================================================

-- 1) deal_forecasts (one per match/deal candidate)
create table public.deal_forecasts (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  match_id                      uuid references public.match_intelligence_profiles(id) on delete cascade,
  deal_id                       uuid references public.deals(id) on delete set null,
  buyer_id                      uuid references public.buyers(id) on delete set null,
  seller_id                     uuid references public.sellers(id) on delete set null,
  property_id                   uuid references public.properties(id) on delete set null,
  assigned_agent_id             uuid references public.users(id) on delete set null,
  locality                      text,
  property_type                 text,
  forecast_stage                text not null default 'active',
  closing_probability           smallint not null default 0,
  expected_close_date           date,
  expected_days_to_close        integer,
  estimated_deal_value          bigint,
  estimated_commission          bigint,
  probability_weighted_revenue  bigint not null default 0,
  deal_health_score             smallint not null default 0,
  deal_risk_score               smallint not null default 0,
  urgency_score                 smallint not null default 0,
  momentum_score                smallint not null default 0,
  confidence_score              smallint not null default 0,
  primary_blocker               text,
  next_best_action              text,
  forecast_reason               text,
  ai_summary                    text,
  ai_risk_summary               text,
  ai_recommendation_summary     text,
  status                        text not null default 'active',
  metadata                      jsonb not null default '{}'::jsonb,
  last_calculated_at            timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint deal_forecasts_uniq unique (organization_id, match_id)
);
create index deal_forecasts_org_idx     on public.deal_forecasts(organization_id);
create index deal_forecasts_agent_idx    on public.deal_forecasts(assigned_agent_id);
create index deal_forecasts_prob_idx      on public.deal_forecasts(closing_probability desc);
create index deal_forecasts_status_idx     on public.deal_forecasts(status);

-- 2) pipeline_snapshots (daily org-level)
create table public.pipeline_snapshots (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  date                          date not null default current_date,
  total_pipeline_value          bigint not null default 0,
  probability_weighted_revenue  bigint not null default 0,
  expected_commission           bigint not null default 0,
  active_forecasts_count        integer not null default 0,
  high_probability_count        integer not null default 0,
  at_risk_count                 integer not null default 0,
  expected_closes_7d            integer not null default 0,
  expected_closes_30d           integer not null default 0,
  by_agent                      jsonb not null default '[]'::jsonb,
  by_locality                   jsonb not null default '[]'::jsonb,
  by_property_type              jsonb not null default '[]'::jsonb,
  metadata                      jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint pipeline_snapshots_uniq unique (organization_id, date)
);
create index pipeline_snapshots_org_idx   on public.pipeline_snapshots(organization_id);
create index pipeline_snapshots_date_idx   on public.pipeline_snapshots(date desc);

-- 3) deal_forecast_signals
create table public.deal_forecast_signals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  forecast_id      uuid references public.deal_forecasts(id) on delete cascade,
  signal_type      text not null,
  title            text not null,
  description      text,
  impact_score     smallint not null default 50,
  confidence_score smallint not null default 60,
  metadata         jsonb not null default '{}'::jsonb,
  status           text not null default 'new',
  created_at       timestamptz not null default now()
);
create index deal_forecast_signals_org_idx   on public.deal_forecast_signals(organization_id);
create index deal_forecast_signals_type_idx   on public.deal_forecast_signals(signal_type);

-- updated_at triggers
create trigger trg_deal_forecasts_updated before update on public.deal_forecasts
  for each row execute function public.set_updated_at();
create trigger trg_pipeline_snapshots_updated before update on public.pipeline_snapshots
  for each row execute function public.set_updated_at();

-- RLS. deal_forecasts: managers org-wide, agents own (assigned_agent_id = auth.uid()).
alter table public.deal_forecasts enable row level security;
create policy "deal_forecasts_select" on public.deal_forecasts for select to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or assigned_agent_id = auth.uid()));
create policy "deal_forecasts_write" on public.deal_forecasts for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent')) with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

do $$
declare t text;
  tbls text[] := array['pipeline_snapshots','deal_forecast_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.deal_forecasts, public.pipeline_snapshots, public.deal_forecast_signals to authenticated;
grant all privileges on
  public.deal_forecasts, public.pipeline_snapshots, public.deal_forecast_signals to service_role;
