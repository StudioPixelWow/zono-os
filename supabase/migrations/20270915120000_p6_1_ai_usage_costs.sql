-- ============================================================================
-- ZONO — P6.1 AI Usage & Cost · ADDITIVE table migration.
-- STATUS: PROPOSED — NOT APPLIED. Requires explicit approval (migration gate).
--
-- Canonical AI provider usage/economics store. Kept SEPARATE from product-usage
-- telemetry: domain_events = product usage; ai_usage_costs = AI provider
-- economics (linked via source_event_id when an AI action also emits a domain
-- event). Stores METADATA ONLY — never prompts, completions, raw responses,
-- API keys, or auth data (enforced in the writer + a CHECK-free app contract).
--
-- Cost is authoritative-source-only: with no verified pricing source configured,
-- rows carry tokens (when the provider returns them) and cost_amount = NULL,
-- cost_basis = 'unavailable'. No fabricated prices.
--
-- Additive: NEW table only. No changes to existing tables/columns/RLS/data.
-- ============================================================================

create table if not exists public.ai_usage_costs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  feature_key     text not null,
  provider        text not null,
  model           text not null,
  request_type    text not null default 'chat',
  input_tokens    integer,
  output_tokens   integer,
  total_tokens    integer,
  cost_amount     numeric(12,6),                 -- NULL unless an authoritative source exists
  currency        text not null default 'USD',
  cost_basis      text not null default 'unavailable',  -- provider_reported | estimated | unavailable
  status          text not null default 'success',      -- success | failed
  error_category  text,                          -- normalized safe category only, never raw payloads
  duration_ms     integer,
  attempt         smallint not null default 1,   -- provider invocation # (retries each recorded)
  source_event_id uuid,                          -- link to domain_events.id when applicable
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint ai_usage_costs_tokens_nonneg check (
    (input_tokens is null or input_tokens >= 0) and
    (output_tokens is null or output_tokens >= 0) and
    (total_tokens is null or total_tokens >= 0)
  ),
  constraint ai_usage_costs_status_chk check (status in ('success','failed')),
  constraint ai_usage_costs_basis_chk check (cost_basis in ('provider_reported','estimated','unavailable'))
);

-- Query-pattern indexes (org/time, provider/time, model/time, feature/time).
create index if not exists ai_usage_costs_org_time_idx      on public.ai_usage_costs (organization_id, created_at desc);
create index if not exists ai_usage_costs_provider_time_idx on public.ai_usage_costs (provider, created_at desc);
create index if not exists ai_usage_costs_model_time_idx    on public.ai_usage_costs (model, created_at desc);
create index if not exists ai_usage_costs_feature_time_idx  on public.ai_usage_costs (feature_key, created_at desc);
create index if not exists ai_usage_costs_org_feature_idx   on public.ai_usage_costs (organization_id, feature_key, created_at desc);

-- ── RLS: platform service-role DAL only (mirrors support_tickets P5.7) ───────
-- Enable RLS with NO anon/authenticated policies → the customer app cannot read
-- or write this table; only the service-role platform DAL (which bypasses RLS)
-- accesses it. Attribution is server-derived; no cross-org customer exposure.
alter table public.ai_usage_costs enable row level security;
revoke all on public.ai_usage_costs from anon, authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.ai_usage_costs;   -- drops the table + its indexes
