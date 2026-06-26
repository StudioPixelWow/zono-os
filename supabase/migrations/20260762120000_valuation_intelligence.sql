-- ============================================================================
-- ZONO — PHASE 4: Valuation Intelligence & Explainability
-- ----------------------------------------------------------------------------
-- Stores a full, auditable AI valuation report alongside each valuation:
--   • valuation_history       — one immutable row per calculation (trend/audit)
--   • valuation_explanations  — the latest explanation object (strengths,
--     weaknesses, market insights, price position, negotiation, confidence)
-- valuation_comparables already exists (Phase price-intelligence). Additive +
-- idempotent. RLS via current_org_id(). No UI changes, real data only.
-- ============================================================================

-- ── valuation_history — append-only audit of every calculation ───────────────
create table if not exists public.valuation_history (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  valuation_id       uuid not null references public.property_valuations(id) on delete cascade,
  property_id        uuid references public.properties(id) on delete set null,
  estimated_value    numeric,
  price_per_sqm      numeric,
  confidence         numeric,
  market_position    text,
  comparable_count   integer not null default 0,
  sold_comparable_count integer not null default 0,
  sources_used       jsonb not null default '[]'::jsonb,
  algorithm_version  text not null default 'avm-v2',
  valuation_available boolean not null default true,
  calculated_at      timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists valuation_history_val_idx  on public.valuation_history(valuation_id, created_at desc);
create index if not exists valuation_history_org_idx  on public.valuation_history(organization_id);
create index if not exists valuation_history_prop_idx on public.valuation_history(property_id);

-- ── valuation_explanations — latest explanation object per valuation ─────────
create table if not exists public.valuation_explanations (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  valuation_id         uuid not null references public.property_valuations(id) on delete cascade,
  market_position      text,
  explanation          text,
  strengths            jsonb not null default '[]'::jsonb,
  weaknesses           jsonb not null default '[]'::jsonb,
  market_insights      jsonb not null default '[]'::jsonb,
  negotiation_analysis jsonb not null default '{}'::jsonb,
  confidence_breakdown jsonb not null default '{}'::jsonb,
  algorithm_version    text not null default 'avm-v2',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (valuation_id)
);
create index if not exists valuation_explanations_org_idx on public.valuation_explanations(organization_id);

-- ── updated_at trigger on explanations ───────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at')
     and not exists (select 1 from pg_trigger where tgname = 'trg_valuation_explanations_updated') then
    execute 'create trigger trg_valuation_explanations_updated before update on public.valuation_explanations for each row execute function public.set_updated_at();';
  end if;
end $$;

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['valuation_history','valuation_explanations'] loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_org_id());', t || '_select', t);

    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t || '_insert', t);

    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t || '_update', t);

    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t || '_delete', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
