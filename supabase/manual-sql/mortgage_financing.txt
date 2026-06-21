-- ============================================================================
-- ZONO — Mortgage & Financing Intelligence OS
-- ----------------------------------------------------------------------------
-- A financial-intelligence layer (NOT a calculator) that answers: can this
-- buyer actually purchase, how much can they afford, what financing risk /
-- opportunity exists, and how does financing affect deal probability & revenue.
-- buyer_financial_profiles stores raw financial inputs + deterministically
-- computed affordability/readiness outputs. financing_signals feeds Decision
-- Brain + Automation. Idempotent. Org column: organization_id. Org-scoped RLS.
-- ============================================================================

create table if not exists public.buyer_financial_profiles (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  buyer_id                 uuid not null references public.buyers(id) on delete cascade,
  -- raw financial inputs
  monthly_income           integer,
  household_income         integer,
  employment_type          text,
  self_employed            boolean not null default false,
  salary_employed          boolean not null default true,
  existing_mortgage        integer,
  monthly_debt             integer,
  available_equity         integer,
  available_down_payment   integer,
  investment_capital       integer,
  -- computed affordability outputs
  recommended_budget       integer,
  max_budget               integer,
  safe_budget              integer,
  monthly_payment_estimate integer,
  down_payment_gap         integer,
  financing_gap            integer,
  required_equity          integer,
  cash_gap                 integer,
  -- computed scores (0-100)
  financial_readiness_score  integer,
  financing_confidence_score integer,
  approval_probability       integer,
  financing_strength         integer,
  purchase_readiness         integer,
  overall_readiness          integer,
  financing_risk             text not null default 'unknown',
  readiness_band             text not null default 'unknown',
  primary_gap                text,
  notes                      text,
  inputs_complete            boolean not null default false,
  metadata                   jsonb not null default '{}'::jsonb,
  computed_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint bfp_financing_risk_chk check (financing_risk in ('unknown','low','medium','high','critical')),
  constraint bfp_readiness_band_chk check (readiness_band in ('unknown','not_ready','needs_help','nearly_ready','ready')),
  constraint bfp_buyer_uniq unique (organization_id, buyer_id)
);

create table if not exists public.financing_signals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  buyer_id         uuid references public.buyers(id) on delete cascade,
  deal_id          uuid references public.deals(id) on delete set null,
  signal_type      text not null,
  score            integer not null default 50,
  title            text not null,
  reason           text,
  recommended_action text,
  status           text not null default 'open',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint financing_signals_type_chk check (signal_type in (
    'financing_risk','financing_opportunity','cash_gap','high_readiness_buyer','low_readiness_buyer',
    'buyer_missing_financing_data','financing_ready','buyer_can_upgrade_budget','buyer_budget_unrealistic')),
  constraint financing_signals_status_chk check (status in ('open','resolved','dismissed'))
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists bfp_org_idx        on public.buyer_financial_profiles(organization_id);
create index if not exists bfp_buyer_idx       on public.buyer_financial_profiles(buyer_id);
create index if not exists bfp_readiness_idx    on public.buyer_financial_profiles(organization_id, readiness_band);
create index if not exists bfp_risk_idx         on public.buyer_financial_profiles(organization_id, financing_risk);
create index if not exists financing_signals_org_idx on public.financing_signals(organization_id, status);
create index if not exists financing_signals_buyer_idx on public.financing_signals(buyer_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
  tbls text[] := array['buyer_financial_profiles','financing_signals'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS (org-scoped; agent may write on their own org rows) ───────────────────
do $$
declare t text;
  tbls text[] := array['buyer_financial_profiles','financing_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;
